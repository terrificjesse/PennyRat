import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  clampInt,
  dedupeByTitle,
  extractJson,
  parseModelItems,
  slugId,
  stripReasoning,
  truncate,
} from './parse';

/**
 * The shapes in here are what a reasoning model with no JSON mode actually sends
 * back: a trace, some prose, the answer, and a closing remark.
 */

describe('stripReasoning', () => {
  it('removes a think block and keeps the answer', () => {
    const raw = '<think>Let me consider the options carefully.</think>\n[{"name":"a"}]';
    expect(stripReasoning(raw)).toBe('[{"name":"a"}]');
  });

  it('removes several blocks and alternate tag names', () => {
    const raw =
      '<think>first</think>middle<thinking>second</thinking>' +
      '<REASONING>third</REASONING>[1]';
    expect(stripReasoning(raw)).not.toMatch(/first|second|third/);
    expect(stripReasoning(raw)).toContain('[1]');
  });

  it('leaves an unterminated block alone rather than discarding the answer', () => {
    const raw = '<think>cut off mid thought [{"name":"kept"}]';
    expect(stripReasoning(raw)).toContain('kept');
  });
});

describe('extractJson', () => {
  it('reads a bare array', () => {
    expect(extractJson('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('reads through a prose preamble and a closing remark', () => {
    const raw = 'Here are the venues you asked for:\n[{"a":1}]\nLet me know if you need more.';
    expect(extractJson(raw)).toEqual([{ a: 1 }]);
  });

  it('reads a fenced block', () => {
    expect(extractJson('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it('is not fooled by braces inside a string', () => {
    const raw = '[{"description":"a room with {brackets} in it","a":1}]';
    expect(extractJson(raw)).toEqual([
      { description: 'a room with {brackets} in it', a: 1 },
    ]);
  });

  it('is not fooled by an escaped quote inside a string', () => {
    const raw = '[{"name":"the \\"best\\" ramen","a":1}]';
    expect(extractJson(raw)).toEqual([{ name: 'the "best" ramen', a: 1 }]);
  });

  it('prefers the last complete answer when the model corrects itself', () => {
    const raw = 'First attempt:\n[{"wrong":true}]\nActually, corrected:\n[{"right":true}]';
    expect(extractJson(raw)).toEqual([{ right: true }]);
  });

  it('tolerates a trailing comma', () => {
    expect(extractJson('[{"a":1},]')).toEqual([{ a: 1 }]);
  });

  it('skips a reasoning trace that contains its own JSON example', () => {
    const raw =
      '<think>The format should look like [{"example":true}] roughly.</think>' +
      '[{"real":true}]';
    expect(extractJson(raw)).toEqual([{ real: true }]);
  });

  it('returns null when there is no JSON at all', () => {
    expect(extractJson('I am not able to help with that request.')).toBeNull();
  });

  it('returns null on a truncated object rather than guessing', () => {
    expect(extractJson('[{"a":1},{"b":')).toBeNull();
  });
});

const itemSchema = z.object({
  name: z.string().min(1),
  cost: z.number().nonnegative(),
});

describe('parseModelItems', () => {
  it('keeps the good items and drops only the bad one', () => {
    const raw = `<think>working</think>[
      {"name":"first","cost":10},
      {"name":"second","cost":"not a number"},
      {"name":"third","cost":30}
    ]`;
    const result = parseModelItems(raw, itemSchema);

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.name)).toEqual(['first', 'third']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('item 2');
    expect(result.fatal).toBeUndefined();
  });

  it('unwraps an array the model nested under a key of its choosing', () => {
    const raw = '{"activities":[{"name":"a","cost":1}]}';
    expect(parseModelItems(raw, itemSchema).items).toHaveLength(1);
  });

  it('reports a fatal when nothing parses, so the caller can retry', () => {
    const result = parseModelItems('I cannot do that.', itemSchema);
    expect(result.items).toEqual([]);
    expect(result.fatal).toBe('no JSON found in the response');
  });

  it('reports a fatal when every item is invalid', () => {
    const result = parseModelItems('[{"bad":1},{"also":2}]', itemSchema);
    expect(result.fatal).toContain('all 2 items failed validation');
  });

  it('names the offending field in the warning', () => {
    const result = parseModelItems('[{"name":"a","cost":-5}]', itemSchema);
    expect(result.warnings[0]).toContain('cost');
  });
});

describe('slugId', () => {
  it('derives a readable id from the title', () => {
    expect(slugId('act_', 'Tokyo National Museum', new Set())).toBe('act_tokyo_national_museum');
  });

  it('is stable across runs for the same input', () => {
    expect(slugId('act_', 'Shibuya Sky', new Set())).toBe(
      slugId('act_', 'Shibuya Sky', new Set()),
    );
  });

  it('suffixes a collision instead of overwriting it', () => {
    const taken = new Set<string>();
    expect(slugId('act_', 'Ichiran', taken)).toBe('act_ichiran');
    expect(slugId('act_', 'Ichiran', taken)).toBe('act_ichiran_2');
  });

  it('strips accents and scripts that cannot survive an id', () => {
    expect(slugId('act_', 'Sensō-ji Temple', new Set())).toBe('act_senso_ji_temple');
  });

  it('falls back rather than producing a bare prefix', () => {
    expect(slugId('act_', '!!!', new Set())).toBe('act_item');
  });
});

describe('dedupeByTitle', () => {
  it('drops a repeat that differs only in case and spacing', () => {
    const items = [{ t: 'Shibuya Sky' }, { t: 'shibuya  sky' }, { t: 'Tokyo Tower' }];
    expect(dedupeByTitle(items, (item) => item.t)).toHaveLength(2);
  });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('short', 20)).toBe('short');
  });

  it('breaks on a word and marks the cut', () => {
    const result = truncate('the quick brown fox jumps over the lazy dog', 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toContain('jum…');
  });

  it('collapses runs of whitespace', () => {
    expect(truncate('a   b\n\nc', 20)).toBe('a b c');
  });
});

describe('clampInt', () => {
  it('rounds and bounds', () => {
    expect(clampInt(5.6, 0, 10)).toBe(6);
    expect(clampInt(-3, 0, 10)).toBe(0);
    expect(clampInt(99, 0, 10)).toBe(10);
  });

  it('falls back to the minimum on a non-number', () => {
    expect(clampInt(Number.NaN, 7, 10)).toBe(7);
    expect(clampInt(Number.POSITIVE_INFINITY, 7, 10)).toBe(7);
  });
});
