/**
 * Phase 2 smoke tests: scanner, skills, memory (no API calls).
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanProject, projectSummary } from '../dist/scanner/index.js';
import { addSkill, loadSkills, removeSkill, skillsBlock, toRawUrl } from '../dist/skills/index.js';
import { loadMemory, saveMemory, memoryBlock } from '../dist/memory/index.js';
import { GitignoreMatcher } from '../dist/scanner/gitignore.js';

let failed = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failed++;
};

// ── Fixture project ──
const root = mkdtempSync(join(tmpdir(), 'vexi-test-'));
mkdirSync(join(root, 'src', 'api'), { recursive: true });
mkdirSync(join(root, 'node_modules', 'leftpad'), { recursive: true });
mkdirSync(join(root, 'secret'), { recursive: true });
writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { next: '1', prisma: '1' } }));
writeFileSync(join(root, '.gitignore'), 'secret/\n*.log\n');
writeFileSync(join(root, 'src', 'auth.ts'), 'export const a = 1;');
writeFileSync(join(root, 'src', 'api', 'users.ts'), 'export const u = 1;');
writeFileSync(join(root, 'node_modules', 'leftpad', 'index.js'), 'x');
writeFileSync(join(root, 'secret', 'creds.ts'), 'x');
writeFileSync(join(root, 'debug.log'), 'x');
writeFileSync(join(root, 'big.ts'), 'x'.repeat(600 * 1024)); // > 500KB

// ── Scanner ──
const map = await scanProject(root);
check('scanner: finds src files', map.files.includes('src/auth.ts'));
check('scanner: excludes node_modules', !map.files.some((f) => f.includes('node_modules')));
check('scanner: respects .gitignore dir', !map.files.some((f) => f.startsWith('secret/')));
check('scanner: respects .gitignore glob', !map.files.includes('debug.log'));
check('scanner: skips files > 500KB', !map.files.includes('big.ts'));
check('scanner: detects stack', map.stack.includes('Next.js') && map.stack.includes('Prisma'));
check('scanner: detects auth layer', 'auth' in map.layers);
check('scanner: summary is compact', projectSummary(map).length < 2048);

// ── Gitignore matcher ──
const m = new GitignoreMatcher();
m.add('*.log\n/build\ndocs/**\n!keep.log\n');
check('gitignore: glob', m.ignores('a/b.log', false));
check('gitignore: negation', !m.ignores('keep.log', false));
check('gitignore: anchored', m.ignores('build', true) && !m.ignores('src/build', true));

// ── Skills ──
writeFileSync(join(root, 'style.md'), '# API style\nUse REST + Zod.');
const name = await addSkill(root, join(root, 'style.md'));
check('skills: add from file', name === 'style');
const skills = await loadSkills(root);
check('skills: load', skills.length === 1 && skills[0].content.includes('Zod'));
check('skills: block injected', skillsBlock(skills).includes('MUST follow'));
check('skills: github url → raw', toRawUrl('https://github.com/u/r/blob/main/x.md') === 'https://raw.githubusercontent.com/u/r/main/x.md');
check('skills: repo url → readme', toRawUrl('https://github.com/u/r') === 'https://raw.githubusercontent.com/u/r/HEAD/README.md');
check('skills: remove', await removeSkill(root, 'style') && (await loadSkills(root)).length === 0);

// ── Memory ──
const empty = await loadMemory(root);
check('memory: empty default', empty.summary === '' && memoryBlock(empty) === '');
await saveMemory(root, { version: 1, summary: 'S', decisions: ['User chose JWT'], updatedAt: 'now', compressedCount: 4 });
const loaded = await loadMemory(root);
check('memory: persists', loaded.decisions[0] === 'User chose JWT');
check('memory: block renders', memoryBlock(loaded).includes('JWT'));

rmSync(root, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
