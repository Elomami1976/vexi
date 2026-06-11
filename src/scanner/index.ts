/**
 * Project scanner — Feature 2: Full Project Understanding.
 *
 * On startup Vexi walks the project tree and builds a compact map of the
 * codebase: languages, frameworks, architecture layers (frontend / backend /
 * database / auth / devops) and the file tree. The result is cached in
 * .vexi/project.json and a short text summary is injected into every AI
 * prompt so the model understands the whole project, not just one file.
 *
 * Safeguards (prevent context flooding):
 * - Respects .gitignore rules by default
 * - Always excludes node_modules, .git, dist, build, coverage, etc.
 * - Ignores files larger than MAX_FILE_SIZE (500KB)
 * - Caps the number of files included in the summary
 */

import { promises as fs } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { readJson, writeJsonAtomic } from '../utils/fs-atomic.js';
import { GitignoreMatcher } from './gitignore.js';

/** Hard-excluded directories — never scanned regardless of .gitignore. */
const ALWAYS_EXCLUDE = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.vexi',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
]);

/** Ignore files larger than this (bytes) — configurable ceiling. */
export const MAX_FILE_SIZE = 500 * 1024;

/** Cap on files recorded in project.json (keeps prompts small). */
const MAX_FILES = 400;

/** Max directory depth to walk. */
const MAX_DEPTH = 8;

export interface ProjectMap {
  name: string;
  scannedAt: string;
  fileCount: number;
  truncated: boolean;
  languages: Record<string, number>; // extension → file count
  stack: string[]; // detected frameworks/tools
  layers: Record<string, string[]>; // architecture layer → evidence
  files: string[]; // relative paths (capped)
}

const EXT_LANGUAGES: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript (React)',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript (React)',
  '.py': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.cs': 'C#',
  '.cpp': 'C++',
  '.c': 'C',
  '.swift': 'Swift',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.html': 'HTML',
};

/** npm dependency → human-readable stack entry. */
const DEP_STACK: Record<string, string> = {
  next: 'Next.js',
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  '@angular/core': 'Angular',
  express: 'Express',
  fastify: 'Fastify',
  hono: 'Hono',
  nestjs: 'NestJS',
  '@nestjs/core': 'NestJS',
  prisma: 'Prisma',
  '@prisma/client': 'Prisma',
  mongoose: 'MongoDB (Mongoose)',
  pg: 'PostgreSQL',
  mysql2: 'MySQL',
  sqlite3: 'SQLite',
  'better-sqlite3': 'SQLite',
  drizzle_orm: 'Drizzle ORM',
  'drizzle-orm': 'Drizzle ORM',
  tailwindcss: 'Tailwind CSS',
  '@supabase/supabase-js': 'Supabase',
  firebase: 'Firebase',
  'next-auth': 'NextAuth',
  '@auth/core': 'Auth.js',
  passport: 'Passport',
  jsonwebtoken: 'JWT',
  stripe: 'Stripe',
  vite: 'Vite',
  webpack: 'Webpack',
  electron: 'Electron',
  'react-native': 'React Native',
  jest: 'Jest',
  vitest: 'Vitest',
  typescript: 'TypeScript',
  commander: 'CLI (commander)',
};

/** Filename/dependency evidence for architecture layers. */
const LAYER_HINTS: Array<{ layer: string; test: (file: string) => boolean }> = [
  { layer: 'frontend', test: (f) => /\.(tsx|jsx|vue|svelte|css|scss|html)$/.test(f) || /^(src\/)?(components|pages|app|views|public)\//.test(f) },
  { layer: 'backend', test: (f) => /^(src\/)?(api|server|routes|controllers|services|middleware)\//.test(f) || /server\.(ts|js|py|go)$/.test(f) },
  { layer: 'database', test: (f) => /(schema\.(prisma|sql)|migrations?\/|models?\/|\.sql$)/.test(f) },
  { layer: 'auth', test: (f) => /(auth|login|session|jwt|oauth)/i.test(f) },
  { layer: 'devops', test: (f) => /(dockerfile|docker-compose|\.github\/workflows|\.gitlab-ci|terraform|k8s|helm)/i.test(f) },
  { layer: 'tests', test: (f) => /(\.(test|spec)\.|__tests__\/|^tests?\/)/.test(f) },
];

/** Scan the project rooted at `root` and cache the result. */
export async function scanProject(root: string): Promise<ProjectMap> {
  const matcher = new GitignoreMatcher();
  const gitignore = await fs.readFile(join(root, '.gitignore'), 'utf8').catch(() => '');
  if (gitignore) matcher.add(gitignore);

  const files: string[] = [];
  let truncated = false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;

    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).replaceAll('\\', '/');

      if (entry.isDirectory()) {
        if (ALWAYS_EXCLUDE.has(entry.name) || entry.name.startsWith('.')) continue;
        if (matcher.ignores(rel, true)) continue;
        await walk(abs, depth + 1);
      } else if (entry.isFile()) {
        if (matcher.ignores(rel, false)) continue;
        const stat = await fs.stat(abs).catch(() => null);
        if (!stat || stat.size > MAX_FILE_SIZE) continue;
        files.push(rel);
      }
    }
  }

  await walk(root, 0);
  files.sort();

  // ── Languages ──
  const languages: Record<string, number> = {};
  for (const file of files) {
    const ext = file.slice(file.lastIndexOf('.'));
    const lang = EXT_LANGUAGES[ext];
    if (lang) languages[lang] = (languages[lang] ?? 0) + 1;
  }

  // ── Stack (from package.json dependencies) ──
  const stack = new Set<string>();
  const pkg = await readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(join(root, 'package.json'));
  if (pkg) {
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (DEP_STACK[dep]) stack.add(DEP_STACK[dep]);
    }
  }
  // Non-npm ecosystems
  if (files.includes('requirements.txt') || files.includes('pyproject.toml')) stack.add('Python');
  if (files.includes('go.mod')) stack.add('Go');
  if (files.includes('Cargo.toml')) stack.add('Rust');
  if (files.includes('composer.json')) stack.add('PHP');

  // ── Architecture layers ──
  const layers: Record<string, string[]> = {};
  for (const { layer, test } of LAYER_HINTS) {
    const evidence = files.filter(test).slice(0, 5);
    if (evidence.length > 0) layers[layer] = evidence;
  }

  const map: ProjectMap = {
    name: basename(root),
    scannedAt: new Date().toISOString(),
    fileCount: files.length,
    truncated,
    languages,
    stack: [...stack],
    layers,
    files,
  };

  // Cache for other features (and future MCP resource) — best effort.
  await writeJsonAtomic(join(root, '.vexi', 'project.json'), map).catch(() => {});
  return map;
}

/**
 * Render the project map as a compact text block for the system prompt.
 * Kept deliberately small (~1-2KB) so it never floods the context window.
 */
export function projectSummary(map: ProjectMap): string {
  const lines: string[] = [`Project: ${map.name} (${map.fileCount}${map.truncated ? '+' : ''} files)`];

  const langs = Object.entries(map.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang, n]) => `${lang} (${n})`);
  if (langs.length) lines.push(`Languages: ${langs.join(', ')}`);
  if (map.stack.length) lines.push(`Stack: ${map.stack.join(', ')}`);

  for (const [layer, evidence] of Object.entries(map.layers)) {
    lines.push(`${layer[0].toUpperCase() + layer.slice(1)}: ${evidence.join(', ')}`);
  }

  // Top-level structure only (max ~40 entries) — enough for orientation.
  const topLevel = new Set<string>();
  for (const file of map.files) {
    const slash = file.indexOf('/');
    topLevel.add(slash === -1 ? file : file.slice(0, slash) + '/');
    if (topLevel.size >= 40) break;
  }
  lines.push(`Structure: ${[...topLevel].join(' ')}`);

  return lines.join('\n');
}
