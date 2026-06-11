/**
 * Phase 5 smoke tests — Vexi Learn.
 * Run: node scripts/test-phase5.mjs   (after npm run build)
 */

import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isPreferenceSignal,
  gatherEvidence,
  buildLearnMessages,
  learn,
  applyLearned,
  LEARNED_SKILL_NAME,
} from '../dist/learn/index.js';
import { loadSkills } from '../dist/skills/index.js';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}`);
  }
}

// ── 1. Preference-signal heuristics ────────────────────────────────────
check('signal: "don\'t use classes"', isPreferenceSignal("don't use classes, use functions"));
check('signal: "always use tabs"', isPreferenceSignal('always use tabs for indentation'));
check('signal: "prefer fetch"', isPreferenceSignal('I prefer fetch over axios'));
check('signal: "no, actually..."', isPreferenceSignal('no, actually rename it to utils'));
check('signal: spanish "prefiero"', isPreferenceSignal('prefiero usar TypeScript'));
check('signal: arabic "لا تستخدم"', isPreferenceSignal('لا تستخدم مكتبات خارجية'));
check('no signal: plain task', !isPreferenceSignal('add a login page to the app'));
check('no signal: question', !isPreferenceSignal('what does this function return?'));

// ── 2. Evidence gathering from session fixtures ────────────────────────
const root = await mkdtemp(join(tmpdir(), 'vexi-learn-'));
const sessionsDir = join(root, '.vexi', 'sessions');
await mkdir(sessionsDir, { recursive: true });

function session(events) {
  return JSON.stringify({
    version: 1,
    startedAt: new Date().toISOString(),
    project: 'demo',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    lang: 'en',
    events,
  });
}

await writeFile(join(sessionsDir, '2026-06-10-1000.json'), session([
  { role: 'user', content: 'add a signup form', at: 0 },
  { role: 'assistant', content: 'Here is a signup form using a class component...', at: 1000 },
  { role: 'user', content: "don't use class components, always use hooks", at: 2000 },
  { role: 'assistant', content: 'Refactored to hooks.', at: 3000 },
  { role: 'user', content: '/exit', at: 4000 },
]));
await writeFile(join(sessionsDir, '2026-06-11-0900.json'), session([
  { role: 'user', content: 'I prefer named exports, no default exports', at: 0 },
  { role: 'assistant', content: 'Understood.', at: 500 },
  { role: 'user', content: 'write a date helper', at: 1000 },
  { role: 'assistant', content: 'export function formatDate() {...}', at: 2000 },
]));

const evidence = await gatherEvidence(root);
check('evidence: 2 sessions analyzed', evidence.sessionsAnalyzed === 2);
check('evidence: 2 signals found', evidence.signals.length === 2);
check('evidence: signals include hooks correction', evidence.signals.some((s) => s.includes('hooks')));
check('evidence: slash commands skipped', ![...evidence.signals, ...evidence.other].some((s) => s.startsWith('/')));
check('evidence: other has plain tasks', evidence.other.includes('add a signup form'));

// ── 3. Prompt construction ──────────────────────────────────────────────
const messages = buildLearnMessages(evidence);
check('messages: system + user', messages.length === 2 && messages[0].role === 'system' && messages[1].role === 'user');
check('messages: corrections section first', messages[1].content.startsWith('CORRECTIONS'));
check('messages: NOTHING escape documented', messages[0].content.includes('NOTHING'));

// ── 4. learn() with a stub provider ─────────────────────────────────────
const stubMd = '# Learned coding style\n\n## React\n- Always use hooks, never class components\n\n## Modules\n- Named exports only';
const stub = { id: 'anthropic', model: 'stub', stream: async () => '```markdown\n' + stubMd + '\n```' };
const result = await learn(stub, root);
check('learn: returns markdown', result.markdown !== null);
check('learn: fences stripped', result.markdown?.startsWith('# Learned coding style') && !result.markdown.includes('```'));

const nothingStub = { id: 'anthropic', model: 'stub', stream: async () => 'NOTHING' };
const nothing = await learn(nothingStub, root);
check('learn: NOTHING → null markdown', nothing.markdown === null);

const emptyRoot = await mkdtemp(join(tmpdir(), 'vexi-learn-empty-'));
const empty = await learn(stub, emptyRoot);
check('learn: no sessions → null + 0 analyzed', empty.markdown === null && empty.evidence.sessionsAnalyzed === 0);

// ── 5. applyLearned writes a real skill ─────────────────────────────────
const path = await applyLearned(root, result.markdown);
check('apply: file path is learned-style.md', path.endsWith(`${LEARNED_SKILL_NAME}.md`));
const saved = await readFile(path, 'utf8');
check('apply: content saved', saved.includes('Always use hooks'));
const skills = await loadSkills(root);
check('apply: picked up by skills loader', skills.some((s) => s.name === LEARNED_SKILL_NAME));

await rm(root, { recursive: true, force: true });
await rm(emptyRoot, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
