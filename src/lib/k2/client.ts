import type { z } from 'zod';
import type { ResearchMeta } from '../types';
import { cacheKey, readCache, writeCache, writeFailure } from './cache';
import { parseModelItems, type ItemsResult } from './parse';

/**
 * The conversation with K2 Think V2. OpenAI-compatible chat completions, but the
 * endpoint documents neither JSON mode nor tool calling, so this sends a plain
 * prompt and treats the reply as untrusted text. `npm run probe:k2` reports what a
 * given deployment actually honors — believe it over any comment in this file.
 */

export type K2Mode = 'live' | 'cache' | 'fixture';

const TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;
const DEFAULT_MAX_TOKENS = 8192;
const REPAIR_RAW_LIMIT = 4000;

export function k2Mode(): K2Mode {
  const mode = (process.env.K2_MODE ?? 'fixture').trim().toLowerCase();
  return mode === 'live' || mode === 'cache' ? mode : 'fixture';
}

type Config = { apiKey: string; baseUrl: string; model: string };

export function k2Config(): Config {
  return {
    apiKey: (process.env.IFM_API_KEY ?? '').trim(),
    baseUrl: (process.env.IFM_BASE_URL ?? '').trim().replace(/\/+$/, ''),
    model: (process.env.IFM_MODEL ?? 'IFM/K2-Think-V2').trim(),
  };
}

export function k2Configured(): boolean {
  const { apiKey, baseUrl } = k2Config();
  return apiKey.length > 0 && baseUrl.length > 0;
}

class K2Error extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'K2Error';
    this.retryable = retryable;
  }
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type ChatReply = {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
};

function readUsage(payload: unknown): Pick<ChatReply, 'promptTokens' | 'completionTokens'> {
  if (!payload || typeof payload !== 'object') return {};
  const usage = (payload as { usage?: Record<string, unknown> }).usage;
  if (!usage) return {};
  const prompt = usage.prompt_tokens;
  const completion = usage.completion_tokens;
  return {
    promptTokens: typeof prompt === 'number' ? prompt : undefined,
    completionTokens: typeof completion === 'number' ? completion : undefined,
  };
}

function readContent(payload: unknown): string {
  const choices = (payload as { choices?: unknown })?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new K2Error('response contained no choices');
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new K2Error('response contained no message content');
  }
  return content;
}

/** True for the 400 a gateway returns when it does not recognize reasoning_effort. */
function rejectsUnknownParameter(body: string): boolean {
  return /unknown|unrecognized|unsupported|unexpected|not permitted|extra fields/i.test(body);
}

async function postChat(
  messages: ChatMessage[],
  maxTokens: number,
  sendReasoningEffort: boolean,
): Promise<ChatReply> {
  const { apiKey, baseUrl, model } = k2Config();

  // temperature 1.0 / top_p 1.0 are the settings K2 Think was evaluated at. The model
  // card also recommends top_k -1, which is not an OpenAI-compatible field, so it is
  // left to the server default.
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 1.0,
    top_p: 1.0,
    max_tokens: maxTokens,
  };
  if (sendReasoningEffort) body.reasoning_effort = 'high';

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'request failed';
    throw new K2Error(`transport: ${reason}`, true);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 400);
    if (response.status === 400 && sendReasoningEffort && rejectsUnknownParameter(detail)) {
      throw new K2Error('endpoint rejected reasoning_effort', false);
    }
    const retryable = response.status === 429 || response.status >= 500;
    throw new K2Error(`HTTP ${response.status}: ${detail}`, retryable);
  }

  const payload: unknown = await response.json().catch(() => null);
  return { text: readContent(payload), ...readUsage(payload) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function chat(
  messages: ChatMessage[],
  maxTokens: number,
  warnings: string[],
): Promise<ChatReply> {
  let sendReasoningEffort = true;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await postChat(messages, maxTokens, sendReasoningEffort);
    } catch (error) {
      lastError = error;

      if (error instanceof K2Error && error.message === 'endpoint rejected reasoning_effort') {
        sendReasoningEffort = false;
        warnings.push('endpoint does not accept reasoning_effort; retried without it');
        continue;
      }

      const retryable = error instanceof K2Error && error.retryable;
      if (!retryable || attempt === MAX_ATTEMPTS) break;

      const backoff = 400 * 2 ** (attempt - 1) + Math.random() * 300;
      warnings.push(`retrying after ${(error as Error).message}`);
      await sleep(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new K2Error('request failed');
}

/** Meta for a response served from the bundled sample trip rather than research. */
export function fixtureMeta(startedAt: number, note: string): ResearchMeta {
  return {
    source: 'fixture',
    latencyMs: Date.now() - startedAt,
    model: k2Config().model,
    warnings: [note],
  };
}

export type ResearchArgs<T> = {
  /** Short slug used in logs and failure filenames. */
  label: string;
  system: string;
  prompt: string;
  itemSchema: z.ZodType<T>;
  maxTokens?: number;
};

export type ResearchResult<T> = { items: T[]; meta: ResearchMeta };

function repairTurns(raw: string, problem: string): ChatMessage[] {
  return [
    { role: 'assistant', content: raw.slice(0, REPAIR_RAW_LIMIT) },
    {
      role: 'user',
      content:
        `That response could not be parsed: ${problem}. ` +
        'Send the same answer again as a single JSON array and nothing else. ' +
        'No explanation, no markdown fence, no reasoning.',
    },
  ];
}

/**
 * Runs one research prompt and returns validated items. Serves a cache hit when
 * there is one; makes at most one repair round-trip when the model answers with
 * something unparseable. Throws only when there is nothing usable at all — callers
 * fall back to fixtures rather than surfacing an error.
 */
export async function researchItems<T>(args: ResearchArgs<T>): Promise<ResearchResult<T>> {
  const { label, system, prompt, itemSchema, maxTokens = DEFAULT_MAX_TOKENS } = args;
  const { model } = k2Config();
  const mode = k2Mode();
  const started = Date.now();
  const warnings: string[] = [];

  const key = cacheKey(model, `${system}\n${prompt}`);
  const cached = await readCache(key);
  if (cached) {
    const parsed = parseModelItems(cached, itemSchema);
    if (!parsed.fatal) {
      return {
        items: parsed.items,
        meta: {
          source: 'cache',
          latencyMs: Date.now() - started,
          model,
          warnings: [...warnings, ...parsed.warnings],
        },
      };
    }
    warnings.push('ignored an unparseable cache entry');
  }

  if (mode !== 'live') {
    throw new K2Error(`K2_MODE=${mode} and nothing cached for ${label}`);
  }
  if (!k2Configured()) {
    throw new K2Error('IFM_API_KEY or IFM_BASE_URL is not set');
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ];

  const first = await chat(messages, maxTokens, warnings);
  await writeCache(key, first.text);

  let parsed: ItemsResult<T> = parseModelItems(first.text, itemSchema);

  if (parsed.fatal) {
    warnings.push(`first reply unusable (${parsed.fatal}); asked the model to repair it`);
    const repaired = await chat(
      [...messages, ...repairTurns(first.text, parsed.fatal)],
      maxTokens,
      warnings,
    );
    parsed = parseModelItems(repaired.text, itemSchema);
    if (!parsed.fatal) await writeCache(key, repaired.text);
  }

  if (parsed.fatal) {
    await writeFailure(label, first.text);
    throw new K2Error(`${label}: ${parsed.fatal}`);
  }

  const latencyMs = Date.now() - started;
  const tokens = first.completionTokens ?? 0;
  console.info(
    `[k2] ${label} ${parsed.items.length} items in ${latencyMs}ms` +
      (tokens ? ` (${tokens} completion tokens)` : ''),
  );

  return {
    items: parsed.items,
    meta: { source: 'live', latencyMs, model, warnings: [...warnings, ...parsed.warnings] },
  };
}
