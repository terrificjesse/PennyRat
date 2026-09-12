import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SCHEMA_VERSION } from '../types';

/**
 * K2 Think is slow and its output tokens are not free, so every response is cached
 * by prompt. Disk in development, where the same few demo cities get researched
 * dozens of times; memory in production, where the filesystem is read-only.
 *
 * SCHEMA_VERSION is part of the key: editing a prompt or a schema invalidates
 * everything that came from the old one.
 */

const CACHE_DIR = path.join(process.cwd(), '.k2cache');
const MEMORY_LIMIT = 64;

const memory = new Map<string, string>();

export function cacheKey(model: string, prompt: string): string {
  return createHash('sha256')
    .update(`${model} ${SCHEMA_VERSION} ${prompt}`)
    .digest('hex')
    .slice(0, 32);
}

function onDisk(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export async function readCache(key: string): Promise<string | null> {
  if (!onDisk()) return memory.get(key) ?? null;
  try {
    return await readFile(path.join(CACHE_DIR, `${key}.txt`), 'utf8');
  } catch {
    return null;
  }
}

export async function writeCache(key: string, raw: string): Promise<void> {
  if (!onDisk()) {
    if (memory.size >= MEMORY_LIMIT) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) memory.delete(oldest);
    }
    memory.set(key, raw);
    return;
  }
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, `${key}.txt`), raw, 'utf8');
  } catch {
    // A cache that cannot be written is a slow app, not a broken one.
  }
}

/**
 * Keeps the raw text of a response nothing could parse, so a bad prompt can be
 * diagnosed after the fact instead of guessed at.
 */
export async function writeFailure(label: string, raw: string): Promise<void> {
  if (!onDisk()) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await mkdir(path.join(CACHE_DIR, 'failures'), { recursive: true });
    await writeFile(path.join(CACHE_DIR, 'failures', `${stamp}-${label}.txt`), raw, 'utf8');
  } catch {
    // Same as above.
  }
}
