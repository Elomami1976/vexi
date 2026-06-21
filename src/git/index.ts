/**
 * Git push workflow for the /push slash command.
 *
 * Design: fully injected — run, confirm, and provider are passed in so the
 * module is testable without touching real git, the filesystem, or the network.
 * All user-facing output goes through the injected log function.
 * Every mutating git command is gated behind an explicit confirm call.
 */

import type { Provider, ChatMessage } from '../providers/types.js';

export interface GitPushOpts {
  cwd: string;
  run: (cmd: string, cwd: string) => Promise<{ stdout: string; stderr: string; code: number }>;
  confirm: (message: string) => Promise<boolean>;
  provider: Provider;
  log?: (line: string) => void;
  message?: string;
  branch?: string;
  pushOnly?: boolean;
}

export interface GitPushResult {
  ok: boolean;
  reason?: 'not-a-repo' | 'no-remote' | 'auth-failed' | 'push-failed' | 'nothing-to-do' | 'aborted';
  detail?: string;
}

/** Wrap a string in single quotes, escaping embedded single quotes. */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

const AUTH_SIGNATURES = [
  'could not read',
  'authentication failed',
  'permission denied',
  'terminal prompts disabled',
  'host key verification',
  'batch mode',
];

function isAuthError(combined: string): boolean {
  const lower = combined.toLowerCase();
  return AUTH_SIGNATURES.some((sig) => lower.includes(sig));
}

export async function gitPush(opts: GitPushOpts): Promise<GitPushResult> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const { cwd, run, confirm, provider } = opts;

  // ── 1. Repo check ────────────────────────────────────────────────────────
  const repoCheck = await run('git rev-parse --is-inside-work-tree', cwd);
  if (repoCheck.code !== 0) {
    log('Not a git repository. Initialize one with:');
    log('  git init && git remote add origin <your-repo-url>');
    return { ok: false, reason: 'not-a-repo' };
  }

  // ── 2. Remote check ──────────────────────────────────────────────────────
  const remoteResult = await run('git remote', cwd);
  if (!remoteResult.stdout.trim()) {
    log('No git remote configured. Add one with:');
    log('  git remote add origin <your-repo-url>');
    return { ok: false, reason: 'no-remote' };
  }

  // ── 3. Resolve branch ────────────────────────────────────────────────────
  const branch =
    opts.branch ?? (await run('git rev-parse --abbrev-ref HEAD', cwd)).stdout.trim();
  if (!branch || branch === 'HEAD') {
    log('Cannot determine current branch (detached HEAD?). Checkout a named branch first.');
    return { ok: false, reason: 'aborted', detail: 'detached HEAD' };
  }

  // ── 4. Inspect working state ─────────────────────────────────────────────
  const statusResult = await run('git status --porcelain', cwd);
  // Preserve leading chars (XY status columns) — do NOT trim() the full output.
  const statusLines = statusResult.stdout.split('\n').filter((l) => l.trim().length > 0);
  const diffStat = (await run('git diff --stat HEAD', cwd)).stdout.trim();
  if (diffStat) log(diffStat);

  // ── 5. Stage + commit (skipped when pushOnly) ─────────────────────────────
  if (!opts.pushOnly) {
    if (statusLines.length > 0) {
      // Porcelain format: XY<space>filename — Y != ' ' means unstaged/untracked
      const needsAdd = statusLines.some((l) => l.length >= 2 && l[1] !== ' ');
      if (needsAdd) {
        const addOk = await confirm('Stage all changes? (git add -A)');
        if (!addOk) return { ok: false, reason: 'aborted' };
        await run('git add -A', cwd);
      }

      // Draft or use the provided commit message
      let commitMsg = opts.message ?? '';
      if (!commitMsg) {
        const stagedDiff = (await run('git diff --staged', cwd)).stdout;
        const trimmedDiff = stagedDiff.slice(0, 6000);
        const userContent =
          'Write a single-line Conventional Commits message (type(scope): description) ' +
          'for the following diff. Reply with ONLY the commit message — no explanation, ' +
          'no markdown fences, no backticks.\n\n' +
          (trimmedDiff || '(no staged diff available)');
        const messages: ChatMessage[] = [
          { role: 'system', content: 'You draft git commit messages. Reply with only the message.' },
          { role: 'user', content: userContent },
        ];
        try {
          const raw = await provider.stream(messages, () => {});
          commitMsg = raw.replace(/`/g, '').split('\n')[0]?.trim() ?? '';
        } catch {
          // fall through to default below
        }
        if (!commitMsg) commitMsg = 'chore: update files';
      }

      log(`Proposed commit message: ${commitMsg}`);
      const commitOk = await confirm(`Commit with: "${commitMsg}"?`);
      if (!commitOk) return { ok: false, reason: 'aborted' };

      const commitResult = await run(`git commit -m ${shellQuote(commitMsg)}`, cwd);
      if (commitResult.code !== 0) {
        log(`Commit failed:\n${commitResult.stderr.trim()}`);
        return { ok: false, reason: 'push-failed', detail: commitResult.stderr };
      }
    } else {
      // Nothing staged or unstaged — check for already-committed unpushed work
      const logResult = await run('git log @{u}..HEAD --oneline', cwd);
      if (logResult.code === 0 && !logResult.stdout.trim()) {
        log('Nothing to commit and already up to date with remote.');
        return { ok: false, reason: 'nothing-to-do' };
      }
      if (logResult.stdout.trim()) {
        log(`Unpushed commits:\n${logResult.stdout.trim()}`);
      }
      // code !== 0 means no upstream yet — proceed, the push step will set -u
    }
  }

  // ── 6. Auth pre-flight ───────────────────────────────────────────────────
  const safeBranch = shellQuote(branch);
  // Disable terminal prompts so git never hangs waiting for input.
  // On Windows, Git for Windows respects GIT_TERMINAL_PROMPT via its own env.
  const dryRunCmd =
    process.platform === 'win32'
      ? `git -c core.askPass= push --dry-run origin ${safeBranch}`
      : `GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND='ssh -o BatchMode=yes' git -c core.askPass= push --dry-run origin ${safeBranch}`;

  const dryResult = await run(dryRunCmd, cwd);
  if (dryResult.code !== 0 && isAuthError(dryResult.stderr + dryResult.stdout)) {
    log('Authentication failed. Set up git credentials:');
    log('  • SSH key: https://docs.github.com/authentication/connecting-to-github-with-ssh');
    log('  • HTTPS token: personal access token or git credential helper.');
    return { ok: false, reason: 'auth-failed', detail: dryResult.stderr };
  }

  // ── 7. Push ──────────────────────────────────────────────────────────────
  const upstreamResult = await run(
    `git rev-parse --abbrev-ref --symbolic-full-name ${shellQuote(`${branch}@{upstream}`)}`,
    cwd,
  );
  const hasUpstream =
    upstreamResult.code === 0 && upstreamResult.stdout.trim().length > 0;

  const pushCmd = hasUpstream
    ? `git push origin ${safeBranch}`
    : `git push -u origin ${safeBranch}`;

  const pushOk = await confirm(`Run: ${pushCmd}?`);
  if (!pushOk) return { ok: false, reason: 'aborted' };

  const pushResult = await run(pushCmd, cwd);
  if (pushResult.code !== 0) {
    log(`Push failed:\n${pushResult.stderr.trim()}`);
    return { ok: false, reason: 'push-failed', detail: pushResult.stderr };
  }

  log(`Pushed ${branch} to origin.`);
  return { ok: true };
}
