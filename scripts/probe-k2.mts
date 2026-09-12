/**
 * Finds out what a K2 Think deployment actually supports.
 *
 * Access to K2 Think V2 is granted per-project through build.k2think.ai, and the
 * base URL arrives with that grant rather than in any public document. Nothing in
 * the public docs says whether a given deployment honors JSON mode, tool calling or
 * reasoning_effort. So we ask it.
 *
 *   node --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/probe-k2.ts
 *
 * Deliberately standalone: it imports nothing from src/, so it tests the endpoint
 * rather than our wrapper around it.
 */

const TIMEOUT_MS = 180_000;

const apiKey = (process.env.IFM_API_KEY ?? '').trim();
const baseUrl = (process.env.IFM_BASE_URL ?? '').trim().replace(/\/+$/, '');
const model = (process.env.IFM_MODEL ?? 'IFM/K2-Think-V2').trim();

type Attempt = {
  ok: boolean;
  status?: number;
  ms: number;
  text?: string;
  detail?: string;
  promptTokens?: number;
  completionTokens?: number;
};

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(24)} ${value}`);
}

async function post(body: Record<string, unknown>): Promise<Attempt> {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, ...body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const ms = Date.now() - started;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        ms,
        detail: (await response.text().catch(() => '')).slice(0, 300),
      };
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      ok: true,
      status: response.status,
      ms,
      text: payload.choices?.[0]?.message?.content ?? '',
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
    };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message : 'request failed',
    };
  }
}

const ask = (content: string) => [{ role: 'user', content }];

async function main(): Promise<void> {
  console.log('\nK2 Think endpoint probe\n');
  line('IFM_BASE_URL', baseUrl || 'MISSING');
  line('IFM_API_KEY', apiKey ? `set (${apiKey.length} chars)` : 'MISSING');
  line('IFM_MODEL', model);

  if (!apiKey || !baseUrl) {
    console.log(
      '\nSet IFM_API_KEY and IFM_BASE_URL in .env.local first. Both come from your\n' +
        'IFM onboarding at build.k2think.ai. The app runs without them in\n' +
        'K2_MODE=fixture, which is the default.\n',
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nReachability');
  const listed = await fetch(`${baseUrl}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  })
    .then(async (response) =>
      response.ok ? ((await response.json()) as { data?: { id?: string }[] }) : null,
    )
    .catch(() => null);

  if (listed?.data?.length) {
    line('GET /models', `${listed.data.length} model(s)`);
    for (const entry of listed.data.slice(0, 8)) line('', entry.id ?? '(unnamed)');
  } else {
    line('GET /models', 'not available (fine, many gateways omit it)');
  }

  console.log('\nPlain completion');
  const plain = await post({
    messages: ask('Reply with the single word: ready'),
    max_tokens: 512,
    temperature: 1.0,
    top_p: 1.0,
  });
  line('status', plain.ok ? `${plain.status} in ${plain.ms}ms` : `FAILED ${plain.status ?? ''} ${plain.detail ?? ''}`);
  if (!plain.ok) {
    console.log('\nThe endpoint rejected a minimal request. Check the base URL ends in /v1\n');
    process.exitCode = 1;
    return;
  }
  line('tokens', `${plain.promptTokens ?? '?'} in / ${plain.completionTokens ?? '?'} out`);
  line('reasoning traces', /<think|<thinking|<reasoning/i.test(plain.text ?? '') ? 'YES, must be stripped' : 'none in this reply');
  line('reply', JSON.stringify((plain.text ?? '').slice(0, 120)));

  console.log('\nreasoning_effort');
  const effort = await post({
    messages: ask('Reply with the single word: ready'),
    max_tokens: 512,
    reasoning_effort: 'high',
  });
  line(
    'accepted',
    effort.ok ? `yes, ${effort.ms}ms` : `NO (${effort.status ?? ''}) ${effort.detail?.slice(0, 120) ?? ''}`,
  );

  console.log('\nresponse_format json_object');
  const jsonMode = await post({
    messages: ask('List two colors as {"colors":["a","b"]}'),
    max_tokens: 512,
    response_format: { type: 'json_object' },
  });
  if (!jsonMode.ok) {
    line('accepted', `NO (${jsonMode.status ?? ''}) — do not send it`);
  } else {
    let parses = false;
    try {
      JSON.parse((jsonMode.text ?? '').trim());
      parses = true;
    } catch {
      parses = false;
    }
    line('accepted', 'yes');
    line('actually honored', parses ? 'YES, body was pure JSON' : 'no, body still needs extraction');
  }

  console.log('\nJSON discipline under our own prompt style');
  const disciplined = await post({
    messages: [
      {
        role: 'system',
        content:
          'You answer only with JSON. No preamble, no explanation, no markdown fence. ' +
          'The first character you emit is [ and the last is ].',
      },
      {
        role: 'user',
        content:
          'Give exactly 2 museums in Tokyo as a JSON array of ' +
          '{"name":string,"admissionUsd":number}. Output only JSON.',
      },
    ],
    max_tokens: 2048,
    temperature: 1.0,
    top_p: 1.0,
    reasoning_effort: 'high',
  });

  if (!disciplined.ok) {
    line('status', `FAILED ${disciplined.status ?? ''} ${disciplined.detail ?? ''}`);
  } else {
    const text = disciplined.text ?? '';
    const bare = text.trim().startsWith('[');
    line('latency', `${disciplined.ms}ms`);
    line('completion tokens', String(disciplined.completionTokens ?? '?'));
    line('reasoning traces', /<think|<thinking|<reasoning/i.test(text) ? 'YES' : 'none');
    line('starts with [', bare ? 'yes' : 'no, extraction required');
    line('raw head', JSON.stringify(text.slice(0, 200)));
  }

  console.log(
    '\nWhat to do with this:\n' +
      '  - reasoning_effort rejected      -> client.ts already retries without it\n' +
      '  - json_object honored            -> worth sending; parse.ts stays as the safety net\n' +
      '  - reasoning traces present       -> parse.ts strips them, no action needed\n' +
      '  - latency above ~60s per call    -> warm the cache before demoing\n',
  );
}

await main();
