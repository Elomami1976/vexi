/**
 * Vexi Replay — standalone HTML export.
 *
 * `vexi replay --export` turns a recorded session into a single .html file:
 * - playback controls (play/pause, 1x/2x/4x speed)
 * - messages appear with their real timing, code typed character by character
 * - session summary at the end (duration, messages, model)
 * - "Export video" button using browser-only APIs (getDisplayMedia +
 *   MediaRecorder) — no ffmpeg/ImageMagick in the CLI, keeping the npm
 *   package lightweight
 * - full RTL support when exported with --lang ar (dir="rtl")
 *
 * The session JSON is embedded in the page and rendered via textContent,
 * so message content can never inject markup (XSS-safe).
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Lang } from '../i18n/index.js';
import { loadSession } from './recorder.js';

/** UI labels for the generated page, per export language. */
const LABELS: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Vexi session replay',
    play: 'Play',
    pause: 'Pause',
    restart: 'Restart',
    speed: 'Speed',
    you: 'you',
    vexi: 'vexi',
    summary: 'Session summary',
    duration: 'Duration',
    messages: 'Messages',
    model: 'Model',
    project: 'Project',
    exportVideo: 'Export video',
    exportHint: 'Pick this tab in the screen picker, press Play, then Stop sharing when done.',
    install: 'Replay your own coding sessions:',
  },
  es: {
    title: 'Repetición de sesión de Vexi',
    play: 'Reproducir',
    pause: 'Pausa',
    restart: 'Reiniciar',
    speed: 'Velocidad',
    you: 'tú',
    vexi: 'vexi',
    summary: 'Resumen de la sesión',
    duration: 'Duración',
    messages: 'Mensajes',
    model: 'Modelo',
    project: 'Proyecto',
    exportVideo: 'Exportar vídeo',
    exportHint: 'Elige esta pestaña en el selector de pantalla, pulsa Reproducir y detén la compartición al terminar.',
    install: 'Reproduce tus propias sesiones de programación:',
  },
  pt: {
    title: 'Replay de sessão do Vexi',
    play: 'Reproduzir',
    pause: 'Pausar',
    restart: 'Reiniciar',
    speed: 'Velocidade',
    you: 'você',
    vexi: 'vexi',
    summary: 'Resumo da sessão',
    duration: 'Duração',
    messages: 'Mensagens',
    model: 'Modelo',
    project: 'Projeto',
    exportVideo: 'Exportar vídeo',
    exportHint: 'Escolha esta aba no seletor de tela, pressione Reproduzir e pare o compartilhamento ao final.',
    install: 'Reproduza suas próprias sessões de programação:',
  },
  fr: {
    title: 'Relecture de session Vexi',
    play: 'Lecture',
    pause: 'Pause',
    restart: 'Recommencer',
    speed: 'Vitesse',
    you: 'vous',
    vexi: 'vexi',
    summary: 'Résumé de la session',
    duration: 'Durée',
    messages: 'Messages',
    model: 'Modèle',
    project: 'Projet',
    exportVideo: 'Exporter la vidéo',
    exportHint: 'Choisissez cet onglet dans le sélecteur d\'écran, lancez la lecture, puis arrêtez le partage à la fin.',
    install: 'Rejouez vos propres sessions de codage :',
  },
  ar: {
    title: 'إعادة تشغيل جلسة Vexi',
    play: 'تشغيل',
    pause: 'إيقاف مؤقت',
    restart: 'إعادة',
    speed: 'السرعة',
    you: 'أنت',
    vexi: 'vexi',
    summary: 'ملخص الجلسة',
    duration: 'المدة',
    messages: 'الرسائل',
    model: 'النموذج',
    project: 'المشروع',
    exportVideo: 'تصدير فيديو',
    exportHint: 'اختر هذا التبويب في نافذة مشاركة الشاشة، اضغط تشغيل، ثم أوقف المشاركة عند الانتهاء.',
    install: 'أعد تشغيل جلسات البرمجة الخاصة بك:',
  },
};

export interface ExportOptions {
  lang: Lang;
  /** Session file name (defaults to the most recent). */
  session?: string;
  /** Output path (defaults to vexi-replay-<session>.html in cwd). */
  out?: string;
}

/** Export a recorded session as a standalone HTML file. Returns the path. */
export async function exportReplay(root: string, opts: ExportOptions): Promise<string> {
  const loaded = await loadSession(root, opts.session);
  if (!loaded) {
    throw new Error('No recorded sessions found in .vexi/sessions/ — chat with Vexi first.');
  }

  const html = buildReplayHtml(loaded.session, opts.lang);
  const out = opts.out ?? join(process.cwd(), `vexi-replay-${loaded.name.replace(/\.json$/, '')}.html`);
  await fs.writeFile(out, html, 'utf8');
  return out;
}

/** Build the standalone replay HTML document. */
export function buildReplayHtml(
  session: {
    startedAt: string;
    project: string;
    provider: string;
    model: string;
    events: Array<{ role: string; content: string; at: number }>;
  },
  lang: Lang,
): string {
  const L = LABELS[lang];
  const rtl = lang === 'ar';
  const last = session.events[session.events.length - 1];
  const durationMs = last ? last.at : 0;

  // Embed data safely: escape `<` so `</script>` in content can't close the tag.
  const data = JSON.stringify({ session, durationMs }).replaceAll('<', '\\u003c');

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${L.title} — ${escapeHtml(session.project)}</title>
<style>
  :root { --accent: #2979FF; --bg: #0a0a0f; --panel: #12121a; --text: #e8e8f0; --dim: #8888a0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
         font: 15px/1.6 ui-monospace, 'Cascadia Code', Consolas, Menlo, monospace; }
  header { padding: 24px 20px 8px; text-align: center; }
  header h1 { color: var(--accent); margin: 0 0 4px; font-size: 22px; letter-spacing: 2px; }
  header .meta { color: var(--dim); font-size: 12px; }
  #controls { position: sticky; top: 0; display: flex; gap: 8px; justify-content: center;
              align-items: center; padding: 12px; background: rgba(10,10,15,.92);
              backdrop-filter: blur(6px); z-index: 5; }
  button, select { background: var(--panel); color: var(--text); border: 1px solid #2a2a3a;
                   border-radius: 8px; padding: 8px 16px; font: inherit; cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 700; }
  button:hover { border-color: var(--accent); }
  #bar { height: 3px; background: #1c1c28; }
  #bar > div { height: 100%; width: 0; background: var(--accent); transition: width .2s linear; }
  main { max-width: 860px; margin: 0 auto; padding: 24px 16px 80px; }
  .msg { margin: 18px 0; opacity: 0; transform: translateY(8px); transition: all .3s ease; }
  .msg.shown { opacity: 1; transform: none; }
  .msg .who { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
  .msg.user .who { color: #9aa6ff; }
  .msg.assistant .who { color: var(--accent); }
  .msg .body { background: var(--panel); border: 1px solid #1e1e2c; border-radius: 12px;
               padding: 14px 16px; white-space: pre-wrap; word-wrap: break-word; }
  .msg.user .body { border-inline-start: 3px solid #9aa6ff; }
  .msg.assistant .body { border-inline-start: 3px solid var(--accent); }
  .caret { display: inline-block; width: 8px; background: var(--accent); animation: blink .8s infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  #summary { display: none; margin-top: 36px; border: 1px solid var(--accent); border-radius: 12px;
             padding: 20px; background: var(--panel); }
  #summary h2 { color: var(--accent); margin: 0 0 12px; font-size: 16px; }
  #summary table { width: 100%; border-collapse: collapse; }
  #summary td { padding: 4px 0; } #summary td:first-child { color: var(--dim); width: 40%; }
  footer { text-align: center; padding: 28px 16px 40px; color: var(--dim); font-size: 13px; }
  footer code { display: inline-block; margin-top: 8px; background: var(--panel); color: var(--accent);
                border: 1px solid #2a2a3a; border-radius: 8px; padding: 8px 18px; font-weight: 700; }
  #hint { text-align: center; color: var(--dim); font-size: 12px; padding: 0 16px; }
</style>
</head>
<body>
<header>
  <h1>VEXI</h1>
  <div class="meta">${L.title} · ${escapeHtml(session.project)} · ${escapeHtml(session.model)}</div>
</header>
<div id="controls">
  <button id="play" class="primary">▶ ${L.play}</button>
  <button id="restart">⟲ ${L.restart}</button>
  <select id="speed" aria-label="${L.speed}">
    <option value="1">1×</option><option value="2">2×</option><option value="4">4×</option>
  </select>
  <button id="record">⏺ ${L.exportVideo}</button>
</div>
<div id="bar"><div></div></div>
<p id="hint">${L.exportHint}</p>
<main id="feed"></main>
<main>
  <section id="summary">
    <h2>${L.summary}</h2>
    <table>
      <tr><td>${L.project}</td><td id="s-project"></td></tr>
      <tr><td>${L.model}</td><td id="s-model"></td></tr>
      <tr><td>${L.messages}</td><td id="s-messages"></td></tr>
      <tr><td>${L.duration}</td><td id="s-duration"></td></tr>
    </table>
  </section>
</main>
<footer>
  ${L.install}
  <br><code>npm install -g vexi</code>
  <br><a href="https://github.com/Elomami1976/vexi" style="color:var(--dim)">github.com/Elomami1976/vexi</a>
</footer>
<script>
const DATA = ${data};
const LBL = { play: ${JSON.stringify('▶ ' + L.play)}, pause: ${JSON.stringify('⏸ ' + L.pause)}, you: ${JSON.stringify(L.you)}, vexi: ${JSON.stringify(L.vexi)} };
const feed = document.getElementById('feed');
const bar = document.querySelector('#bar > div');
const playBtn = document.getElementById('play');
const events = DATA.session.events;

// Replay timing: real inter-message gaps, capped so playback stays snappy.
const MAX_GAP = 1800, TYPE_MS = 12, MAX_TYPE = 6000;
let playing = false, idx = 0, timer = null, abortTyping = null;

function speed() { return Number(document.getElementById('speed').value); }

function addMessage(ev, done) {
  const div = document.createElement('div');
  div.className = 'msg ' + ev.role;
  const who = document.createElement('div');
  who.className = 'who';
  who.textContent = ev.role === 'user' ? LBL.you : LBL.vexi;
  const body = document.createElement('div');
  body.className = 'body';
  div.append(who, body);
  feed.append(div);
  requestAnimationFrame(() => div.classList.add('shown'));

  // Typing effect, character by character (textContent = XSS-safe)
  const text = ev.content;
  const perChar = Math.min(TYPE_MS, MAX_TYPE / Math.max(text.length, 1)) / speed();
  let i = 0, cancelled = false;
  abortTyping = () => { cancelled = true; body.textContent = text; };
  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.textContent = '\\u00a0';
  body.append(caret);
  (function type() {
    if (cancelled) { caret.remove(); return done(); }
    const step = Math.max(1, Math.round(2 * speed()));
    i = Math.min(text.length, i + step);
    body.textContent = text.slice(0, i);
    if (i < text.length) { body.append(caret); setTimeout(type, perChar * step); }
    else { caret.remove(); done(); }
  })();
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function next() {
  if (!playing) return;
  if (idx >= events.length) return finish();
  bar.style.width = (idx / events.length * 100) + '%';
  const ev = events[idx];
  const prev = idx > 0 ? events[idx - 1].at : 0;
  const gap = Math.min(Math.max(ev.at - prev, 200), MAX_GAP) / speed();
  timer = setTimeout(() => addMessage(ev, () => { idx++; next(); }), gap);
}

function finish() {
  playing = false;
  playBtn.textContent = LBL.play;
  bar.style.width = '100%';
  const s = document.getElementById('summary');
  s.style.display = 'block';
  document.getElementById('s-project').textContent = DATA.session.project;
  document.getElementById('s-model').textContent = DATA.session.model + ' (' + DATA.session.provider + ')';
  document.getElementById('s-messages').textContent = events.length;
  const sec = Math.round(DATA.durationMs / 1000);
  document.getElementById('s-duration').textContent = Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
  s.scrollIntoView({ behavior: 'smooth' });
}

playBtn.onclick = () => {
  playing = !playing;
  playBtn.textContent = playing ? LBL.pause : LBL.play;
  if (playing) next(); else { clearTimeout(timer); if (abortTyping) abortTyping(); }
};
document.getElementById('restart').onclick = () => {
  clearTimeout(timer); if (abortTyping) abortTyping();
  feed.innerHTML = ''; idx = 0; bar.style.width = '0';
  document.getElementById('summary').style.display = 'none';
  playing = true; playBtn.textContent = LBL.pause; next();
};

// Browser-side video export (MediaRecorder + getDisplayMedia) — zero CLI deps.
document.getElementById('record').onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'vexi-replay.webm'; a.click();
      URL.revokeObjectURL(url);
    };
    stream.getVideoTracks()[0].addEventListener('ended', () => rec.stop());
    rec.start();
  } catch { /* user cancelled the picker */ }
};
</script>
</body>
</html>
`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
