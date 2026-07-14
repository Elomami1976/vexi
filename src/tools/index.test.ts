import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBuiltinToolCall, executeBuiltinTool, buildNativeTools, dispatchNativeTool } from './index.js';
import { SnapshotManager } from '../snapshots/index.js';
import type { McpManager } from '../mcp/client.js';

// A snapshot manager that writes into a throwaway session dir under root.
function makeSnapshots(root: string): SnapshotManager {
  return new SnapshotManager(root, 'test-session');
}

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'vexi-tools-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

// ── parseBuiltinToolCall ──────────────────────────────────────────────────────

describe('parseBuiltinToolCall', () => {
  it('parses a read_file call', () => {
    const call = parseBuiltinToolCall('```vexi-tool\n{"tool": "read_file", "path": "a.ts"}\n```');
    expect(call).toEqual({ tool: 'read_file', args: { path: 'a.ts' } });
  });

  it('ignores MCP calls (those have a server field)', () => {
    const call = parseBuiltinToolCall('```vexi-tool\n{"server": "github", "tool": "read_file", "arguments": {}}\n```');
    expect(call).toBeNull();
  });

  it('ignores unknown tool names', () => {
    expect(parseBuiltinToolCall('```vexi-tool\n{"tool": "rm_rf", "path": "/"}\n```')).toBeNull();
  });

  it('returns null when no block present', () => {
    expect(parseBuiltinToolCall('just some prose')).toBeNull();
  });
});

// ── executeBuiltinTool ────────────────────────────────────────────────────────

describe('executeBuiltinTool: write_file', () => {
  it('creates a new file', async () => {
    const r = await executeBuiltinTool(
      { tool: 'write_file', args: { path: 'x.txt', content: 'hello\nworld' } },
      root,
      makeSnapshots(root),
    );
    expect(r.result).toContain('created x.txt');
    expect(await fs.readFile(join(root, 'x.txt'), 'utf-8')).toBe('hello\nworld');
  });

  it('rejects paths outside the project root', async () => {
    const r = await executeBuiltinTool(
      { tool: 'write_file', args: { path: '../escape.txt', content: 'x' } },
      root,
      makeSnapshots(root),
    );
    expect(r.result).toContain('outside the project root');
    expect(r.files).toEqual([]);
  });
});

describe('executeBuiltinTool: edit_file', () => {
  it('replaces a unique substring', async () => {
    await fs.writeFile(join(root, 'a.ts'), 'const x = 1;\nconst y = 2;\n');
    const r = await executeBuiltinTool(
      { tool: 'edit_file', args: { path: 'a.ts', old: 'const y = 2;', new: 'const y = 3;' } },
      root,
      makeSnapshots(root),
    );
    expect(r.result).toContain('edited a.ts');
    expect(await fs.readFile(join(root, 'a.ts'), 'utf-8')).toBe('const x = 1;\nconst y = 3;\n');
  });

  it('errors when old string is not found', async () => {
    await fs.writeFile(join(root, 'a.ts'), 'const x = 1;\n');
    const r = await executeBuiltinTool(
      { tool: 'edit_file', args: { path: 'a.ts', old: 'nope', new: 'x' } },
      root,
      makeSnapshots(root),
    );
    expect(r.result).toContain('not found');
    expect(await fs.readFile(join(root, 'a.ts'), 'utf-8')).toBe('const x = 1;\n');
  });

  it('errors on a non-unique match unless all=true', async () => {
    await fs.writeFile(join(root, 'a.ts'), 'a\na\na\n');
    const ambiguous = await executeBuiltinTool(
      { tool: 'edit_file', args: { path: 'a.ts', old: 'a', new: 'b' } },
      root,
      makeSnapshots(root),
    );
    expect(ambiguous.result).toContain('matches 3 places');

    const all = await executeBuiltinTool(
      { tool: 'edit_file', args: { path: 'a.ts', old: 'a', new: 'b', all: true } },
      root,
      makeSnapshots(root),
    );
    expect(all.result).toContain('3 replacements');
    expect(await fs.readFile(join(root, 'a.ts'), 'utf-8')).toBe('b\nb\nb\n');
  });

  it('snapshots the pre-edit file so undo restores it exactly', async () => {
    await fs.writeFile(join(root, 'a.ts'), 'original\n');
    const snaps = makeSnapshots(root);
    await executeBuiltinTool(
      { tool: 'edit_file', args: { path: 'a.ts', old: 'original', new: 'changed' } },
      root,
      snaps,
    );
    expect(await fs.readFile(join(root, 'a.ts'), 'utf-8')).toBe('changed\n');
    const entry = await snaps.undo();
    expect(entry).not.toBeNull();
    expect(await fs.readFile(join(root, 'a.ts'), 'utf-8')).toBe('original\n');
  });
});

// ── native tool routing (Feature #2) ──────────────────────────────────────────

describe('buildNativeTools', () => {
  it('exposes the three built-in tools plus namespaced MCP tools', () => {
    const mcp = { tools: [{ server: 'github', name: 'search', description: 'Search repos', inputSchema: { type: 'object' } }] } as unknown as McpManager;
    const { defs, route } = buildNativeTools(mcp);
    const names = defs.map((d) => d.name);
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('github__search');
    expect(route.get('read_file')).toEqual({ kind: 'builtin' });
    expect(route.get('github__search')).toEqual({ kind: 'mcp', server: 'github', tool: 'search' });
  });
});

describe('dispatchNativeTool', () => {
  it('routes built-in names to the file engine', async () => {
    await fs.writeFile(join(root, 'a.ts'), 'x');
    const mcp = { tools: [] } as unknown as McpManager;
    const { route } = buildNativeTools(mcp);
    const r = await dispatchNativeTool('read_file', { path: 'a.ts' }, route, root, makeSnapshots(root), mcp);
    expect(r.result).toContain('FILE a.ts');
  });

  it('routes namespaced names to the MCP server', async () => {
    let called: { server: string; tool: string } | null = null;
    const mcp = {
      tools: [{ server: 'github', name: 'search', description: 'd', inputSchema: {} }],
      callTool: async (server: string, tool: string) => { called = { server, tool }; return 'mcp-result'; },
    } as unknown as McpManager;
    const { route } = buildNativeTools(mcp);
    const r = await dispatchNativeTool('github__search', { q: 'x' }, route, root, makeSnapshots(root), mcp);
    expect(r.result).toBe('mcp-result');
    expect(called).toEqual({ server: 'github', tool: 'search' });
  });

  it('errors on an unknown tool name', async () => {
    const mcp = { tools: [] } as unknown as McpManager;
    const { route } = buildNativeTools(mcp);
    const r = await dispatchNativeTool('bogus', {}, route, root, makeSnapshots(root), mcp);
    expect(r.result).toContain('unknown tool');
  });
});

describe('executeBuiltinTool: read_file', () => {
  it('returns numbered lines within a range', async () => {
    await fs.writeFile(join(root, 'a.ts'), 'l1\nl2\nl3\nl4\n');
    const r = await executeBuiltinTool(
      { tool: 'read_file', args: { path: 'a.ts', start: 2, end: 3 } },
      root,
      makeSnapshots(root),
    );
    expect(r.result).toContain('2\tl2');
    expect(r.result).toContain('3\tl3');
    expect(r.result).not.toContain('l4');
  });

  it('errors on a missing file', async () => {
    const r = await executeBuiltinTool(
      { tool: 'read_file', args: { path: 'nope.ts' } },
      root,
      makeSnapshots(root),
    );
    expect(r.result).toContain('file not found');
  });
});
