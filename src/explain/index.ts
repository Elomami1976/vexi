/**
 * Multilingual code explanation — Feature 4.
 *
 *   vexi explain auth.ts --ar    → explains the file in Arabic
 *   vexi explain src/ --es       → explains a folder in Spanish
 *
 * Output strategy (terminal RTL limitation):
 * - Latin-script languages (en/es/pt/fr): streamed directly to the terminal.
 * - Arabic: terminals render RTL text broken, so the explanation is written
 *   to a generated .html file (dir="rtl", renders perfectly) and opened in
 *   the default browser. The raw markdown is saved alongside as .md.
 */

import { promises as fs } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import type { Lang } from '../i18n/index.js';
import type { ChatMessage, Provider } from '../providers/types.js';

/** Limits to keep prompts within context windows. */
const MAX_FILE_BYTES = 100 * 1024;
const MAX_TOTAL_BYTES = 120 * 1024;
const MAX_FILES = 20;

/** Source-code extensions considered when explaining a folder. */
const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java',
  '.kt', '.rb', '.php', '.cs', '.cpp', '.c', '.h', '.swift', '.vue', '.svelte',
  '.sql', '.sh', '.css', '.scss', '.html', '.json', '.yml', '.yaml', '.toml', '.md',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.vexi', '.next', 'out']);

export interface GatheredSource {
  files: Array<{ rel: string; content: string }>;
  truncated: boolean;
}

/** Collect source files from a file or directory path, with size caps. */
export async function gatherSource(target: string): Promise<GatheredSource> {
  const abs = resolve(target);
  const stat = await fs.stat(abs); // throws a clear ENOENT for bad paths

  const files: Array<{ rel: string; content: string }> = [];
  let total = 0;
  let truncated = false;

  async function addFile(path: string, rel: string): Promise<void> {
    if (files.length >= MAX_FILES || total >= MAX_TOTAL_BYTES) {
      truncated = true;
      return;
    }
    const s = await fs.stat(path).catch(() => null);
    if (!s || s.size > MAX_FILE_BYTES) {
      if (s) truncated = true;
      return;
    }
    const content = await fs.readFile(path, 'utf8').catch(() => null);
    if (content === null) return;
    total += content.length;
    files.push({ rel, content });
  }

  if (stat.isFile()) {
    await addFile(abs, basename(abs));
  } else {
    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (files.length >= MAX_FILES || total >= MAX_TOTAL_BYTES) {
          truncated = true;
          return;
        }
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) await walk(path);
        } else if (entry.isFile()) {
          const ext = entry.name.slice(entry.name.lastIndexOf('.'));
          if (CODE_EXTS.has(ext)) {
            await addFile(path, relative(abs, path).replaceAll('\\', '/'));
          }
        }
      }
    }
    await walk(abs);
  }

  if (files.length === 0) {
    throw new Error(`No readable source files found at: ${target}`);
  }
  return { files, truncated };
}

const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  ar: 'Modern Standard Arabic (العربية الفصحى)',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
};

/** Build the explanation prompt for the model. */
export function buildExplainMessages(source: GatheredSource, lang: Lang): ChatMessage[] {
  const code = source.files
    .map((f) => `### FILE: ${f.rel}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  return [
    {
      role: 'system',
      content: [
        `You are Vexi, an expert code explainer. Write the entire explanation in fluent ${LANG_NAMES[lang]}.`,
        'Structure the output as Markdown with exactly these parts:',
        '1. A heading with the file/project name, then a short purpose summary.',
        '2. A function-by-function (or section-by-section) breakdown, citing line numbers.',
        '3. A final note on how the pieces fit together (business logic, not just syntax).',
        'Keep code identifiers, keywords and file names in English; explain around them.',
        lang === 'ar' ? 'اكتب الشرح كاملًا بالعربية الفصحى السليمة.' : '',
      ].filter(Boolean).join('\n'),
    },
    {
      role: 'user',
      content: `Explain the following code:\n\n${code}${source.truncated ? '\n\n(Note: some files were omitted due to size limits.)' : ''}`,
    },
  ];
}

/**
 * Run the explanation.
 * - Latin-script langs: streams to `onText` (terminal) and returns null.
 * - Arabic: collects silently, writes .md + .html next to cwd and returns
 *   the HTML path for the caller to open.
 */
export async function explain(
  provider: Provider,
  target: string,
  lang: Lang,
  onText: (chunk: string) => void,
): Promise<{ htmlPath: string; mdPath: string } | null> {
  const source = await gatherSource(target);
  const messages = buildExplainMessages(source, lang);

  if (lang !== 'ar') {
    await provider.stream(messages, onText);
    return null;
  }

  // Arabic → file output (RTL renders perfectly in the browser)
  const markdown = await provider.stream(messages, () => {});
  const base = `vexi-explain-${basename(resolve(target)).replace(/[^a-z0-9_-]+/gi, '-')}`;
  const mdPath = join(process.cwd(), `${base}.md`);
  const htmlPath = join(process.cwd(), `${base}.html`);
  await fs.writeFile(mdPath, markdown, 'utf8');
  await fs.writeFile(htmlPath, explanationHtml(markdown, basename(resolve(target))), 'utf8');
  return { htmlPath, mdPath };
}

/** Wrap the markdown explanation in a standalone RTL HTML page. */
export function explanationHtml(markdown: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>شرح ${escapeHtml(title)} — Vexi</title>
<style>
  :root { --accent: #2979FF; --bg: #0a0a0f; --panel: #12121a; --text: #e8e8f0; --dim: #8888a0; }
  body { margin: 0; background: var(--bg); color: var(--text);
         font: 17px/1.9 "Segoe UI", Tahoma, "Noto Naskh Arabic", sans-serif; }
  main { max-width: 820px; margin: 0 auto; padding: 32px 20px 80px; }
  h1, h2, h3 { color: var(--accent); }
  code, pre { direction: ltr; text-align: left; font: 14px/1.6 ui-monospace, Consolas, monospace; }
  code { background: var(--panel); border-radius: 6px; padding: 2px 8px; }
  pre { background: var(--panel); border: 1px solid #1e1e2c; border-inline-start: 3px solid var(--accent);
        border-radius: 10px; padding: 14px 16px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-inline-start: 3px solid var(--accent); margin-inline-start: 0;
               padding-inline-start: 16px; color: var(--dim); }
  footer { text-align: center; color: var(--dim); padding: 24px; font-size: 13px; }
  footer code { color: var(--accent); }
</style>
</head>
<body>
<main>${renderMarkdown(markdown)}</main>
<footer>Generated by Vexi · <code>npm install -g vexi</code> ·
<a href="https://github.com/Elomami1976/vexi" style="color:var(--dim)">GitHub</a></footer>
</body>
</html>
`;
}

/**
 * Minimal markdown → HTML renderer (headings, fenced code, inline code,
 * bold, lists, paragraphs). Everything is HTML-escaped first — no raw
 * model output ever reaches the DOM unescaped.
 */
export function renderMarkdown(md: string): string {
  const out: string[] = [];
  const lines = md.split(/\r?\n/);
  let inCode = false;
  let codeBuffer: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(escapeHtml(line));
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (item) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(item[1])}</li>`);
      continue;
    }

    closeList();
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }

  if (inCode) out.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`);
  closeList();
  return out.join('\n');
}

/** Inline markdown: escape first, then bold and inline code. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
