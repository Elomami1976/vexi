/**
 * Custom Skills system — Feature 2.5.
 *
 * Skills are plain markdown files in `.vexi/skills/` (per project). On
 * session start every skill is read and injected into the system prompt,
 * so generated code follows the user's own conventions, e.g.:
 *
 *   .vexi/skills/api-style.md    "All API endpoints follow REST + Zod validation"
 *   .vexi/skills/arabic-docs.md  "All documentation written in Arabic"
 *
 * Skills can be added from local files or shared via GitHub URLs:
 *   vexi skill add https://github.com/user/react-best-practices
 */

import { promises as fs } from 'node:fs';
import { basename, extname, join } from 'node:path';

/** Max size of a single skill file (keeps the system prompt sane). */
const MAX_SKILL_SIZE = 64 * 1024;

export interface Skill {
  name: string; // file name without .md
  content: string;
}

function skillsDir(root: string): string {
  return join(root, '.vexi', 'skills');
}

/** Load all skills for a project (empty array when none exist). */
export async function loadSkills(root: string): Promise<Skill[]> {
  const dir = skillsDir(root);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const content = await fs.readFile(join(dir, entry.name), 'utf8').catch(() => '');
    if (content.trim()) {
      skills.push({
        name: entry.name.slice(0, -3),
        content: content.slice(0, MAX_SKILL_SIZE).trim(),
      });
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** Render skills as a system-prompt block ('' when there are none). */
export function skillsBlock(skills: Skill[]): string {
  if (skills.length === 0) return '';
  const parts = ['## User skills (project conventions you MUST follow)'];
  for (const skill of skills) {
    parts.push(`### ${skill.name}\n${skill.content}`);
  }
  return parts.join('\n\n');
}

/**
 * Add a skill from a local file path or a URL (GitHub URLs are converted
 * to raw content automatically). Returns the saved skill name.
 */
export async function addSkill(root: string, source: string): Promise<string> {
  let content: string;
  let name: string;

  if (/^https?:\/\//i.test(source)) {
    const url = toRawUrl(source);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Could not fetch ${url} (HTTP ${res.status})`);
    }
    content = await res.text();
    name = skillNameFromUrl(source);
  } else {
    content = await fs.readFile(source, 'utf8');
    name = basename(source, extname(source));
  }

  content = content.slice(0, MAX_SKILL_SIZE).trim();
  if (!content) throw new Error('Skill source is empty.');

  name = sanitizeName(name);
  const dir = skillsDir(root);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, `${name}.md`), content + '\n', 'utf8');
  return name;
}

/** Remove a skill by name. Returns true when a file was deleted. */
export async function removeSkill(root: string, name: string): Promise<boolean> {
  const file = join(skillsDir(root), `${sanitizeName(name)}.md`);
  try {
    await fs.unlink(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert GitHub web URLs to raw-content URLs:
 *   github.com/user/repo                    → raw .../main/README.md
 *   github.com/user/repo/blob/branch/x.md   → raw .../branch/x.md
 * Other URLs pass through unchanged.
 */
export function toRawUrl(url: string): string {
  const blob = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
  if (blob) {
    return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`;
  }
  const repo = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (repo) {
    return `https://raw.githubusercontent.com/${repo[1]}/${repo[2]}/HEAD/README.md`;
  }
  return url;
}

/** Derive a skill name from a URL (last meaningful path segment). */
function skillNameFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  let last = segments[segments.length - 1] ?? 'skill';
  last = last.replace(/\.(md|markdown)$/i, '');
  // For repo root URLs use the repo name, not "README"
  if (/^readme$/i.test(last) && segments.length >= 2) {
    last = segments[1].replace(/\.git$/i, '');
  }
  return last;
}

/** Keep skill file names safe and predictable. */
function sanitizeName(name: string): string {
  const safe = name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return safe || 'skill';
}
