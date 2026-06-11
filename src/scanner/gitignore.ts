/**
 * Minimal .gitignore matcher.
 *
 * Supports the common subset of gitignore syntax used in real projects:
 * comments, blank lines, `dir/` patterns, leading `/` anchors, `*` and `?`
 * wildcards, `**` globstars, and `!` negation. Paths are matched relative
 * to the project root using forward slashes.
 */

interface Rule {
  regex: RegExp;
  negated: boolean;
  dirOnly: boolean;
}

export class GitignoreMatcher {
  private rules: Rule[] = [];

  /** Parse the contents of a .gitignore file and add its rules. */
  add(content: string): void {
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      let pattern = line;
      let negated = false;
      if (pattern.startsWith('!')) {
        negated = true;
        pattern = pattern.slice(1);
      }

      let dirOnly = false;
      if (pattern.endsWith('/')) {
        dirOnly = true;
        pattern = pattern.slice(0, -1);
      }

      // A pattern containing a slash is anchored to the root;
      // otherwise it matches at any depth.
      const anchored = pattern.startsWith('/') || pattern.slice(0, -1).includes('/');
      if (pattern.startsWith('/')) pattern = pattern.slice(1);

      const regex = globToRegex(pattern, anchored);
      if (regex) this.rules.push({ regex, negated, dirOnly });
    }
  }

  /**
   * Test whether a relative path (forward slashes, no leading slash)
   * is ignored. `isDir` enables `dir/`-only rules.
   */
  ignores(relPath: string, isDir: boolean): boolean {
    let ignored = false;
    for (const rule of this.rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.regex.test(relPath)) ignored = !rule.negated;
    }
    return ignored;
  }
}

/** Convert a gitignore glob to a RegExp. Returns null for unusable patterns. */
function globToRegex(glob: string, anchored: boolean): RegExp | null {
  if (!glob) return null;

  let re = '';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**` matches across directory separators
        re += '.*';
        i += 2;
        if (glob[i] === '/') i++; // collapse `**/`
        continue;
      }
      re += '[^/]*';
    } else if (ch === '?') {
      re += '[^/]';
    } else {
      re += escapeRegex(ch);
    }
    i++;
  }

  // Unanchored patterns match at any depth; all patterns also match
  // everything underneath a matched directory.
  const prefix = anchored ? '^' : '(^|/)';
  try {
    return new RegExp(`${prefix}${re}(/|$)`);
  } catch {
    return null;
  }
}

function escapeRegex(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}
