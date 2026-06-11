// Adds a fixture session full of style corrections (for e2e learn testing).
// Usage: node scripts/make-learn-session.mjs [targetRoot]
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const dir = join(root, '.vexi', 'sessions');
await mkdir(dir, { recursive: true });

const session = {
  version: 1,
  startedAt: new Date().toISOString(),
  project: 'demo-app',
  provider: 'Groq',
  model: 'llama-3.3-70b',
  lang: 'en',
  events: [
    { role: 'user', content: 'create a users service', at: 0 },
    { role: 'assistant', content: 'class UserService { ... } with default export.', at: 800 },
    { role: 'user', content: "don't use classes, I always prefer plain functions and named exports", at: 2000 },
    { role: 'assistant', content: 'Refactored to plain functions with named exports.', at: 3000 },
    { role: 'user', content: 'no, use async/await instead of .then() chains, always', at: 4000 },
    { role: 'assistant', content: 'Switched to async/await.', at: 5000 },
    { role: 'user', content: 'please use 2-space indentation and single quotes everywhere', at: 6000 },
    { role: 'assistant', content: 'Formatting updated.', at: 7000 },
  ],
};

await writeFile(join(dir, '2026-06-11-1030.json'), JSON.stringify(session, null, 2));
console.log('learn fixture saved');
