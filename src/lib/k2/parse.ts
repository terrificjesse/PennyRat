import type { z } from 'zod';

/**
 * Turning a reasoning model's answer into data we are willing to show a user.
 *
 * K2 Think has no JSON mode and no tool calling, so a response can arrive as a
 * reasoning trace, then a sentence of preamble, then the JSON, then a closing
 * remark. Nothing here assumes cooperation.
 */

const REASONING_PAIRS = [
  /<think>[\s\S]*?<\/think>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
  /<reasoning>[\s\S]*?<\/reasoning>/gi,
];

/**
 * Removes well-formed reasoning blocks. A trace left unterminated by a truncated
 * response is deliberately left alone — the JSON scanner copes, and cutting from an
 * unmatched tag to the end of the string would throw away the answer.
 */
export function stripReasoning(text: string): string {
  let out = text;
  for (const pattern of REASONING_PAIRS) {
    out = out.replace(pattern, ' ');
  }
  return out.trim();
}

type Span = { start: number; end: number };

/**
 * Every balanced top-level `{...}` or `[...]` in the text, in the order they appear.
 * String literals are tracked so a brace inside a description cannot end a span.
 */
function balancedSpans(text: string): Span[] {
  const spans: Span[] = [];
  let depth = 0;
  let start = -1;
  let opener = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      if (depth === 0) {
        start = i;
        opener = ch;
      }
      depth += 1;
    } else if (ch === '}' || ch === ']') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        if (ch === (opener === '{' ? '}' : ']')) spans.push({ start, end: i + 1 });
        start = -1;
      }
    }
  }

  return spans;
}

function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Candidate JSON strings, best guess last — fenced blocks first, then every
 * balanced span. Callers read from the end, because a model that corrects itself
 * puts the real answer after the false start.
 */
export function jsonCandidates(text: string): string[] {
  const cleaned = stripReasoning(text);
  const candidates: string[] = [];

  for (const match of cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const inner = match[1]?.trim();
    if (inner) candidates.push(inner);
  }

  for (const span of balancedSpans(cleaned)) {
    candidates.push(cleaned.slice(span.start, span.end));
  }

  return candidates;
}

/** The last candidate that parses as an object or array, or null. */
export function extractJson(text: string): unknown {
  const candidates = jsonCandidates(text);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i];
    for (const attempt of [candidate, stripTrailingCommas(candidate)]) {
      try {
        const value = JSON.parse(attempt);
        if (value !== null && typeof value === 'object') return value;
      } catch {
        // Try the next form, then the next candidate.
      }
    }
  }
  return null;
}

/**
 * Every balanced `{...}` in the text that is not nested inside another one, whether
 * or not the array around them was ever closed.
 *
 * This is the salvage path. A reply cut off by the token limit has no closing `]`,
 * so nothing parses as a whole; the same is true of a reply that drops a comma
 * between two entries. Reading the objects individually turns "lost all twelve"
 * into "lost the one that was broken".
 */
function objectSpans(text: string): Span[] {
  const spans: Span[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        spans.push({ start, end: i + 1 });
        start = -1;
      }
    }
  }

  return spans;
}

/** Individually parseable objects from a reply whose overall structure is broken. */
export function salvageObjects(text: string): unknown[] {
  const cleaned = stripReasoning(text);
  const salvaged: unknown[] = [];

  for (const span of objectSpans(cleaned)) {
    const candidate = cleaned.slice(span.start, span.end);
    for (const attempt of [candidate, stripTrailingCommas(candidate)]) {
      try {
        const value = JSON.parse(attempt);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          salvaged.push(value);
          break;
        }
      } catch {
        // This one is the casualty; the rest of the reply is still worth having.
      }
    }
  }

  return salvaged;
}

/**
 * Pulls the list out of whatever wrapper the model chose: a bare array, or an
 * object with one array property whatever it happens to be called.
 */
function asArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) {
      if (Array.isArray(nested)) return nested;
    }
  }
  return null;
}

function issueSummary(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'failed validation';
  const where = issue.path.join('.');
  return where ? `${where}: ${issue.message}` : issue.message;
}

export type ItemsResult<T> = {
  items: T[];
  warnings: string[];
  /** Set when nothing at all could be read, which is the only case worth a retry. */
  fatal?: string;
};

/**
 * Validates the model's list one element at a time. A single malformed entry costs
 * that entry and nothing else — throwing away fifteen good venues because the
 * sixteenth invented a field would be the wrong trade.
 */
export function parseModelItems<T>(raw: string, itemSchema: z.ZodType<T>): ItemsResult<T> {
  const warnings: string[] = [];

  const value = extractJson(raw);
  let list = value === null ? null : asArray(value);

  // Nothing parsed as a whole. Before giving up, read out the objects that are
  // individually intact — a truncated or mis-punctuated array still carries most of
  // its entries.
  if (!list) {
    const salvaged = salvageObjects(raw);
    if (salvaged.length === 0) {
      return {
        items: [],
        warnings,
        fatal: value === null ? 'no JSON found in the response' : 'response JSON contained no array',
      };
    }
    list = salvaged;
    warnings.push(`recovered ${salvaged.length} entries from a malformed or truncated reply`);
  }

  const items: T[] = [];

  list.forEach((entry, index) => {
    const parsed = itemSchema.safeParse(entry);
    if (parsed.success) items.push(parsed.data);
    else warnings.push(`dropped item ${index + 1} (${issueSummary(parsed.error)})`);
  });

  if (items.length === 0) {
    return { items, warnings, fatal: `all ${list.length} items failed validation` };
  }

  return { items, warnings };
}

/**
 * A readable id derived from the title, stable across runs so a re-fetch does not
 * invalidate what the user already checked.
 */
export function slugId(prefix: string, title: string, taken: Set<string>): string {
  const base =
    title
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'item';

  let id = `${prefix}${base}`;
  let suffix = 2;
  while (taken.has(id)) {
    id = `${prefix}${base}_${suffix}`;
    suffix += 1;
  }
  taken.add(id);
  return id;
}

export function dedupeByTitle<T>(items: T[], titleOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = titleOf(item).toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Collapses whitespace and trims to `limit`, breaking on a word where it can. */
export function truncate(text: string, limit: number): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * A star rating onto the app's five-point scale.
 *
 * The model answers in whatever scale the source it is thinking of uses: 4.6 out of
 * five for one property, 8.7 out of ten for the next, occasionally a percentage.
 * Rejecting the ones that overshoot cost ten of twelve Tokyo hotels in a single
 * batch, so they are converted instead.
 */
export function normalizeRating(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;

  const onFive =
    value <= 5 ? value : value <= 10 ? value / 2 : value <= 100 ? value / 20 : Number.NaN;

  return Number.isFinite(onFive) ? Math.round(onFive * 10) / 10 : undefined;
}

/**
 * A maps link for a place, built from what it is called and roughly where it is.
 *
 * Never from coordinates: `lat`/`lng` come back empty on effectively every researched
 * venue because the model does not fill them, and one it invents drops a pin in the sea.
 * A search query always resolves, and resolves to the right thing far more often than a
 * guessed coordinate does.
 */
export function mapsSearchUrl(...parts: (string | undefined)[]): string {
  const query = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
