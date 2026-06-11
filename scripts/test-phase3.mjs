/**
 * Phase 3 smoke tests: session recorder, replay HTML export,
 * explain source gathering + markdown rendering (no API calls).
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionRecorder, listSessions, loadSession } from '../dist/replay/recorder.js';
import { buildReplayHtml, exportReplay } from '../dist/replay/export.js';
import { gatherSource, buildExplainMessages, renderMarkdown, explanationHtml } from '../dist/explain/index.js';

let failed = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failed++;
};

const root = mkdtempSync(join(tmpdir(), 'vexi-p3-'));

// ── Recorder ──
const rec = new SessionRecorder(root, { project: 'demo', provider: 'Groq', model: 'llama', lang: 'en' });
rec.add('user', 'hello');
rec.add('assistant', 'hi there\n```js\nconsole.log(1)\n```');
await rec.save();
const sessions = await listSessions(root);
check('recorder: file created', sessions.length === 1 && /^\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(sessions[0]));
const loaded = await loadSession(root);
check('recorder: roundtrip', loaded?.session.events.length === 2 && loaded.session.events[0].content === 'hello');
check('recorder: timestamps relative', typeof loaded.session.events[1].at === 'number' && loaded.session.events[1].at >= 0);

// ── Replay export ──
const html = buildReplayHtml(loaded.session, 'en');
check('replay: standalone html', html.startsWith('<!DOCTYPE html>') && html.includes('npm install -g vexi'));
check('replay: embeds events', html.includes('hello') && html.includes('MediaRecorder'));
check('replay: ltr for en', html.includes('dir="ltr"'));
const htmlAr = buildReplayHtml(loaded.session, 'ar');
check('replay: rtl for ar', htmlAr.includes('dir="rtl"') && htmlAr.includes('ملخص الجلسة'));

// script-injection safety: content with </script> must not break the page
const evil = { ...loaded.session, events: [{ role: 'user', content: '</script><script>alert(1)</script>', at: 0 }] };
const evilHtml = buildReplayHtml(evil, 'en');
check('replay: </script> escaped', !evilHtml.includes('</script><script>alert(1)'));

const outPath = join(root, 'replay.html');
await exportReplay(root, { lang: 'en', out: outPath });
check('replay: export writes file', existsSync(outPath) && readFileSync(outPath, 'utf8').includes('VEXI'));

// ── Explain: gathering ──
mkdirSync(join(root, 'proj', 'src'), { recursive: true });
mkdirSync(join(root, 'proj', 'node_modules', 'x'), { recursive: true });
writeFileSync(join(root, 'proj', 'src', 'auth.ts'), 'export function login() {}');
writeFileSync(join(root, 'proj', 'node_modules', 'x', 'i.js'), 'x');
writeFileSync(join(root, 'proj', 'big.ts'), 'y'.repeat(200 * 1024)); // > 100KB per-file cap
const single = await gatherSource(join(root, 'proj', 'src', 'auth.ts'));
check('explain: single file', single.files.length === 1 && single.files[0].content.includes('login'));
const dir = await gatherSource(join(root, 'proj'));
check('explain: folder skips node_modules', !dir.files.some((f) => f.rel.includes('node_modules')));
check('explain: folder skips oversized', !dir.files.some((f) => f.rel === 'big.ts'));
let threw = false;
try { await gatherSource(join(root, 'missing')); } catch { threw = true; }
check('explain: missing path throws', threw);

// ── Explain: prompts + rendering ──
const msgs = buildExplainMessages(single, 'ar');
check('explain: arabic prompt', msgs[0].content.includes('العربية') && msgs[1].content.includes('login'));
const md = '# Title\n\nSome **bold** and `code`.\n\n- item1\n- item2\n\n```js\nconst x = 1 < 2;\n```\n';
const rendered = renderMarkdown(md);
check('markdown: heading/bold/code', rendered.includes('<h1>') && rendered.includes('<strong>bold</strong>') && rendered.includes('<code>code</code>'));
check('markdown: list', rendered.includes('<ul>') && rendered.includes('<li>item2</li>'));
check('markdown: fenced code escaped', rendered.includes('const x = 1 &lt; 2;'));
const xss = renderMarkdown('hello <img src=x onerror=alert(1)>');
check('markdown: html escaped', !xss.includes('<img'));
const page = explanationHtml(md, 'auth.ts');
check('explain html: rtl page', page.includes('dir="rtl"') && page.includes('npm install -g vexi'));

rmSync(root, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
