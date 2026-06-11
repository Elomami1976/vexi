import { sanitizeKey, detectProvider } from '../dist/providers/index.js';

const cases = [
  ['sk-ant-abc123', 'anthropic'],
  ['sk-or-v1-xyz', 'openrouter'],
  ['gsk_abc', 'groq'],
  ['AIzaSyXXX', 'gemini'],
  [' sk-proj-aaa \n', 'openai'],
  ['"sk-1234"', 'openai'],
  ["'sk-ant-quoted'", 'anthropic'],
  ['weirdkey', null],
  ['', null],
];

let failed = 0;
for (const [raw, expected] of cases) {
  const got = detectProvider(sanitizeKey(raw));
  const pass = got === expected;
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${JSON.stringify(raw)} → ${got} (expected ${expected})`);
}
process.exit(failed ? 1 : 0);
