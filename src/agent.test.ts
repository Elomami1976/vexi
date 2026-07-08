import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { extractShellBlocks, runCommand } from './agent.js';

describe('extractShellBlocks', () => {
  it('extracts a single bash block', () => {
    const reply = 'Run this:\n```bash\nnpm install\n```\nThen restart.';
    expect(extractShellBlocks(reply)).toEqual(['npm install']);
  });

  it('extracts multiple blocks across different fence languages', () => {
    const reply = [
      '```sh\necho one\n```',
      'some text in between',
      '```powershell\nWrite-Output "two"\n```',
      '```cmd\necho three\n```',
    ].join('\n');
    expect(extractShellBlocks(reply)).toEqual(['echo one', 'Write-Output "two"', 'echo three']);
  });

  it('is case-insensitive on the fence language tag', () => {
    const reply = '```BASH\nls -la\n```';
    expect(extractShellBlocks(reply)).toEqual(['ls -la']);
  });

  it('trims whitespace inside the block', () => {
    const reply = '```bash\n\n  npm test  \n\n```';
    expect(extractShellBlocks(reply)).toEqual(['npm test']);
  });

  it('skips empty blocks', () => {
    const reply = '```bash\n\n\n```\nSome text\n```sh\necho hi\n```';
    expect(extractShellBlocks(reply)).toEqual(['echo hi']);
  });

  it('ignores non-shell fenced blocks (e.g. ```ts, ```json)', () => {
    const reply = '```ts\nconst x = 1;\n```\n```json\n{"a": 1}\n```';
    expect(extractShellBlocks(reply)).toEqual([]);
  });

  it('returns an empty array when the reply has no code fences', () => {
    expect(extractShellBlocks('just a plain text answer, no commands here')).toEqual([]);
  });

  it('handles multiple blocks of the same language', () => {
    const reply = '```bash\necho a\n```\n```bash\necho b\n```';
    expect(extractShellBlocks(reply)).toEqual(['echo a', 'echo b']);
  });
});

// Shell-specific commands: runCommand picks powershell.exe on win32, /bin/sh elsewhere.
const isWin = process.platform === 'win32';
const echoCmd = (text: string) => (isWin ? `Write-Output '${text}'` : `echo '${text}'`);
const sleepCmd = (seconds: number) => (isWin ? `Start-Sleep -Seconds ${seconds}` : `sleep ${seconds}`);

describe('runCommand', () => {
  it('captures stdout and a zero exit code on success', async () => {
    const { stdout, code } = await runCommand(echoCmd('hello-vexi'), tmpdir());
    expect(stdout).toContain('hello-vexi');
    expect(code).toBe(0);
  });

  it('captures a non-zero exit code on failure', async () => {
    const { code } = await runCommand('exit 3', tmpdir());
    expect(code).toBe(3);
  });

  it('kills the process and reports a timeout note once the deadline passes', async () => {
    const { stderr, code } = await runCommand(sleepCmd(5), tmpdir(), 300);
    expect(stderr).toContain('timeout');
    expect(code).not.toBe(0);
  }, 10_000);

  it('does not time out when the command finishes well within the deadline', async () => {
    const { stdout, stderr } = await runCommand(echoCmd('fast'), tmpdir(), 10_000);
    expect(stdout).toContain('fast');
    expect(stderr).not.toContain('timeout');
  });
});
