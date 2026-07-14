/**
 * Remote model manifest — Feature #4.
 *
 * Default models drift as providers ship new versions. Hardcoding them in
 * PROVIDER_INFO means a stale default requires a full Vexi release to fix.
 * This module lets Vexi pick up refreshed defaults from a small, version-pinned
 * JSON manifest hosted at vexi.pro, cached locally, with the compiled-in
 * PROVIDER_INFO defaults as the always-safe fallback.
 *
 * Design mirrors the npm update check (src/update): a synchronous read of the
 * local cache on the hot path, plus a best-effort background refresh that never
 * blocks startup and swallows all errors.
 *
 *   manifest shape:  { "version": 1, "defaults": { "openai": "gpt-4o-mini", … } }
 */

import { promises as fs } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VEXI_DIR } from '../config.js';

const MANIFEST_URL = 'https://vexi.pro/models.json';
const MANIFEST_CACHE_PATH = join(VEXI_DIR, 'models.json');
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 1500;

/** Manifest schema version this Vexi understands. Newer manifests are ignored. */
const SUPPORTED_MANIFEST_VERSION = 1;

interface ModelManifest {
  version: number;
  defaults: Record<string, string>;
}

interface CachedManifest extends ModelManifest {
  lastCheck: string;
}

/** Validate an unknown value as a usable manifest, or return null. */
function parseManifest(raw: unknown): ModelManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== SUPPORTED_MANIFEST_VERSION) return null;
  if (!obj.defaults || typeof obj.defaults !== 'object') return null;
  const defaults: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj.defaults as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) defaults[k] = v.trim();
  }
  return { version: SUPPORTED_MANIFEST_VERSION, defaults };
}

/**
 * Read the locally cached manifest synchronously (hot path). Returns null when
 * absent, unreadable, malformed, or a version this build doesn't support.
 */
function loadCachedManifest(): ModelManifest | null {
  try {
    const raw = readFileSync(MANIFEST_CACHE_PATH, 'utf8');
    return parseManifest(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Resolve the default model for a provider id: a cached remote override if one
 * exists, otherwise the compiled-in fallback. Never throws.
 */
export function defaultModelFor(id: string, fallback: string): string {
  const manifest = loadCachedManifest();
  return manifest?.defaults[id] ?? fallback;
}

/**
 * Best-effort background refresh of the model manifest. Fire-and-forget from
 * startup — returns immediately if the cache is fresh, otherwise fetches (max
 * 1500 ms) and rewrites the cache. All errors are swallowed.
 */
export async function refreshManifest(): Promise<void> {
  try {
    const cacheRaw = await fs.readFile(MANIFEST_CACHE_PATH, 'utf8').catch(() => null);
    if (cacheRaw) {
      try {
        const cache = JSON.parse(cacheRaw) as CachedManifest;
        const age = Date.now() - new Date(cache.lastCheck).getTime();
        if (Number.isFinite(age) && age < REFRESH_INTERVAL_MS) return; // still fresh
      } catch {
        // malformed cache — fall through and refetch
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(MANIFEST_URL, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return;
    const manifest = parseManifest(await res.json());
    if (!manifest) return;

    await fs.mkdir(VEXI_DIR, { recursive: true }).catch(() => {});
    await fs.writeFile(
      MANIFEST_CACHE_PATH,
      JSON.stringify({ ...manifest, lastCheck: new Date().toISOString() }),
      'utf8',
    ).catch(() => {});
  } catch {
    // network error, timeout, or bad JSON — silently ignored
  }
}
