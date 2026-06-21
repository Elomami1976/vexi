import { describe, it, expect } from 'vitest';
import type { Provider } from '../providers/types.js';
import { gitPush } from './index.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

type RunResult = { stdout: string; stderr: string; code: number };

/** Build a mock `run` that returns canned results matched by command substring. */
function makeRun(specs: { match: string; out: RunResult }[] = []) {
  const calls: string[] = [];
  const run = async (cmd: string, _cwd: string): Promise<RunResult> => {
    calls.push(cmd);
    for (const spec of specs) {
      if (cmd.includes(spec.match)) return spec.out;
    }
    return { stdout: '', stderr: '', code: 0 };
  };
  return { run, calls };
}

/** Build a mock `confirm` that returns scripted booleans in sequence. */
function makeConfirm(answers: boolean[] = []) {
  const calls: string[] = [];
  let i = 0;
  const confirm = async (msg: string): Promise<boolean> => {
    calls.push(msg);
    return answers[i++] ?? true;
  };
  return { confirm, calls };
}

const MOCK_PROVIDER: Provider = {
  id: 'openai',
  model: 'gpt-4o',
  stream: async () => 'feat: add new feature',
};

const OK: RunResult = { stdout: '', stderr: '', code: 0 };

/** Specs shared by all happy-path scenarios. */
function happySpecs(branch = 'main', opts: { upstreamExists?: boolean } = {}) {
  return [
    { match: '--is-inside-work-tree', out: { stdout: 'true\n', stderr: '', code: 0 } },
    { match: 'git remote', out: { stdout: 'origin\n', stderr: '', code: 0 } },
    { match: '--abbrev-ref HEAD', out: { stdout: `${branch}\n`, stderr: '', code: 0 } },
    { match: 'status --porcelain', out: OK },
    { match: 'diff --stat HEAD', out: OK },
    { match: 'push --dry-run', out: OK }, // must come before 'push origin'
    {
      match: '--symbolic-full-name',
      out: opts.upstreamExists === false
        ? { stdout: '', stderr: 'fatal: no upstream configured', code: 128 }
        : { stdout: `origin/${branch}\n`, stderr: '', code: 0 },
    },
    { match: 'push origin', out: OK },
    { match: 'push -u', out: OK },
  ];
}

// ── Test cases ────────────────────────────────────────────────────────────────

describe('gitPush', () => {
  // 1. Not a git repo
  it('returns not-a-repo and runs no mutating commands', async () => {
    const { run, calls } = makeRun([
      { match: '--is-inside-work-tree', out: { stdout: '', stderr: '', code: 128 } },
    ]);
    const { confirm } = makeConfirm();
    const logs: string[] = [];

    const result = await gitPush({
      cwd: '/proj', run, confirm, provider: MOCK_PROVIDER,
      log: (l) => logs.push(l),
    });

    expect(result).toEqual({ ok: false, reason: 'not-a-repo' });
    expect(calls.some((c) => c.includes('git add'))).toBe(false);
    expect(calls.some((c) => c.includes('git commit'))).toBe(false);
    expect(calls.some((c) => c.includes('git push'))).toBe(false);
    expect(logs.some((l) => l.includes('git init'))).toBe(true);
  });

  // 2. No remote configured
  it('returns no-remote and nothing is pushed', async () => {
    const { run, calls } = makeRun([
      { match: '--is-inside-work-tree', out: { stdout: 'true\n', stderr: '', code: 0 } },
      { match: 'git remote', out: { stdout: '', stderr: '', code: 0 } },
    ]);
    const { confirm } = makeConfirm();

    const result = await gitPush({
      cwd: '/proj', run, confirm, provider: MOCK_PROVIDER,
    });

    expect(result).toEqual({ ok: false, reason: 'no-remote' });
    expect(calls.some((c) => c.includes('git push'))).toBe(false);
  });

  // 3. Auth pre-flight fails → real push is NEVER run
  it('returns auth-failed when dry-run shows an auth-signature error', async () => {
    const { run, calls } = makeRun([
      { match: '--is-inside-work-tree', out: { stdout: 'true\n', stderr: '', code: 0 } },
      { match: 'git remote', out: { stdout: 'origin\n', stderr: '', code: 0 } },
      { match: '--abbrev-ref HEAD', out: { stdout: 'main\n', stderr: '', code: 0 } },
      { match: 'status --porcelain', out: OK },
      { match: 'diff --stat HEAD', out: OK },
      // dry-run fails with auth-signature stderr
      {
        match: 'push --dry-run',
        out: { stdout: '', stderr: 'could not read Username for remote: terminal prompts disabled', code: 1 },
      },
    ]);
    const { confirm } = makeConfirm([true]); // any confirms before push would be true

    const result = await gitPush({
      cwd: '/proj', run, confirm, provider: MOCK_PROVIDER, pushOnly: true,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('auth-failed');
    // The real (non-dry-run) push must NOT have been called
    expect(calls.some((c) => c.includes('push') && !c.includes('--dry-run'))).toBe(false);
  });

  // 4. Happy path: unstaged changes, no message → add, AI-draft commit, push
  it('stages, AI-drafts commit message, and pushes; returns ok: true', async () => {
    const { run, calls } = makeRun([
      { match: '--is-inside-work-tree', out: { stdout: 'true\n', stderr: '', code: 0 } },
      { match: 'git remote', out: { stdout: 'origin\n', stderr: '', code: 0 } },
      { match: '--abbrev-ref HEAD', out: { stdout: 'main\n', stderr: '', code: 0 } },
      // ' M' → Y='M' → unstaged modification → needsAdd = true
      { match: 'status --porcelain', out: { stdout: ' M src/foo.ts\n', stderr: '', code: 0 } },
      { match: 'diff --stat HEAD', out: { stdout: '1 file changed, 2 insertions(+)\n', stderr: '', code: 0 } },
      { match: 'add -A', out: OK },
      { match: 'diff --staged', out: { stdout: '+added a line\n', stderr: '', code: 0 } },
      { match: 'commit -m', out: OK },
      { match: 'push --dry-run', out: OK },
      { match: '--symbolic-full-name', out: { stdout: 'origin/main\n', stderr: '', code: 0 } },
      { match: 'push origin', out: OK },
    ]);
    // all confirms: add, commit, push
    const { confirm } = makeConfirm([true, true, true]);
    const logs: string[] = [];

    const result = await gitPush({
      cwd: '/proj', run, confirm, provider: MOCK_PROVIDER,
      log: (l) => logs.push(l),
    });

    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.includes('add -A'))).toBe(true);
    expect(calls.some((c) => c.includes('commit -m'))).toBe(true);
    // Real push (non-dry-run) was called
    expect(calls.some((c) => c.includes('push origin') && !c.includes('--dry-run'))).toBe(true);
    // AI-drafted message appears in the log
    expect(logs.some((l) => l.includes('feat: add new feature'))).toBe(true);
    // Final success message
    expect(logs.some((l) => l.includes('Pushed main to origin'))).toBe(true);
  });

  // 5. pushOnly: true → no git add or git commit
  it('pushOnly skips staging and committing, only pushes', async () => {
    const { run, calls } = makeRun(happySpecs());
    const { confirm } = makeConfirm([true]); // only the push confirm

    const result = await gitPush({
      cwd: '/proj', run, confirm, provider: MOCK_PROVIDER, pushOnly: true,
    });

    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.includes('add -A'))).toBe(false);
    expect(calls.some((c) => c.includes('commit -m'))).toBe(false);
    expect(calls.some((c) => c.includes('push origin') && !c.includes('--dry-run'))).toBe(true);
  });

  // 6. User declines push confirm → aborted, no real push runs
  it('returns aborted when user declines the push confirm', async () => {
    const { run, calls } = makeRun(happySpecs());
    // pushOnly so there are no add/commit confirms; only one confirm: the push
    const { confirm } = makeConfirm([false]);

    const result = await gitPush({
      cwd: '/proj', run, confirm, provider: MOCK_PROVIDER, pushOnly: true,
    });

    expect(result).toEqual({ ok: false, reason: 'aborted' });
    // No real push was issued after the decline
    expect(calls.some((c) => c.includes('push origin') && !c.includes('--dry-run'))).toBe(false);
    expect(calls.some((c) => c.includes('push -u'))).toBe(false);
  });

  // 7. New branch with no upstream → git push -u origin <branch>
  it('uses git push -u when no upstream is configured', async () => {
    const branch = 'feature/new-thing';
    const { run, calls } = makeRun(happySpecs(branch, { upstreamExists: false }));
    const { confirm } = makeConfirm([true]);

    const result = await gitPush({
      cwd: '/proj', run, confirm, provider: MOCK_PROVIDER,
      pushOnly: true, branch,
    });

    expect(result).toEqual({ ok: true });
    // Must use -u form, not the plain push
    expect(calls.some((c) => c.includes('push -u'))).toBe(true);
    expect(
      calls.some((c) => c.includes('push origin') && !c.includes('push -u') && !c.includes('--dry-run')),
    ).toBe(false);
  });
});
