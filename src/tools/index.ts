/**
 * Built-in file tools — Feature #1 (structured, deterministic file editing).
 *
 * The original design edited files by asking the model to emit shell commands
 * (`cat >`, `sed -i`, `tee`…) which Vexi then ran, and the snapshot engine
 * *regex-guessed* which files were touched. That is fragile: a mis-escaped
 * `sed` corrupts files, and a missed write leaves nothing to undo.
 *
 * These built-in tools replace that path for editing. They use the same
 * provider-agnostic text protocol as MCP (a fenced ```vexi-tool``` JSON block,
 * WITHOUT a `server` field), so they work with every provider — no native
 * function-calling API required. Because each write goes through here, the
 * snapshot is taken on the *exact* file about to change, making undo precise.
 */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve, relative, sep, dirname } from 'node:path';
import type { SnapshotManager } from '../snapshots/index.js';
import type { ToolDefinition } from '../providers/types.js';
import type { McpManager } from '../mcp/client.js';

/** Names of the built-in tools the model may call. */
export const BUILTIN_TOOL_NAMES = ['read_file', 'write_file', 'edit_file'] as const;
export type BuiltinToolName = (typeof BUILTIN_TOOL_NAMES)[number];

export interface BuiltinToolCall {
  tool: BuiltinToolName;
  args: Record<string, unknown>;
}

/** Cap on how much file content is returned to the model in one read. */
const MAX_READ_BYTES = 64 * 1024;

/**
 * Parse a built-in file-tool call from a model reply, or null.
 * Matches a ```vexi-tool``` block whose `tool` is a known built-in name and
 * which has NO `server` field (that is how MCP tool calls are told apart).
 */
export function parseBuiltinToolCall(reply: string): BuiltinToolCall | null {
  const match = reply.match(/```vexi-tool\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const json = JSON.parse(match[1]);
    if (typeof json.server === 'string') return null; // that's an MCP call
    if (typeof json.tool !== 'string') return null;
    if (!BUILTIN_TOOL_NAMES.includes(json.tool)) return null;
    const { tool, ...args } = json;
    return { tool, args };
  } catch {
    return null;
  }
}

/** Resolve `rel` against `root`, rejecting paths that escape the project root. */
function resolveWithinRoot(root: string, rel: string): string | null {
  const absRoot = resolve(root);
  const abs = isAbsolute(rel) ? resolve(rel) : resolve(absRoot, rel);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return null;
  return abs;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

export interface BuiltinToolResult {
  /** Text handed back to the model as the tool result. */
  result: string;
  /** Project-relative paths that were modified (for logging), if any. */
  files: string[];
}

/**
 * Execute a built-in file tool. Snapshots any file about to be written
 * (via the provided SnapshotManager) so the edit is undoable exactly.
 */
export async function executeBuiltinTool(
  call: BuiltinToolCall,
  root: string,
  snapshots: SnapshotManager,
): Promise<BuiltinToolResult> {
  const rawPath = asString(call.args.path);
  if (!rawPath) return { result: 'TOOL ERROR: missing "path".', files: [] };

  const abs = resolveWithinRoot(root, rawPath);
  if (!abs) return { result: `TOOL ERROR: path "${rawPath}" is outside the project root.`, files: [] };
  const rel = relative(root, abs).replace(/\\/g, '/');

  switch (call.tool) {
    // ── read_file {path, [start], [end]} ────────────────────────────────
    case 'read_file': {
      if (!existsSync(abs)) return { result: `TOOL ERROR: file not found: ${rel}`, files: [] };
      let content: string;
      try {
        content = await fs.readFile(abs, 'utf-8');
      } catch (e) {
        return { result: `TOOL ERROR: cannot read ${rel}: ${e instanceof Error ? e.message : String(e)}`, files: [] };
      }
      const lines = content.split('\n');
      const start = Number.isInteger(call.args.start) ? Math.max(1, call.args.start as number) : 1;
      const end = Number.isInteger(call.args.end) ? Math.min(lines.length, call.args.end as number) : lines.length;
      const slice = lines.slice(start - 1, end);
      let numbered = slice.map((l, i) => `${start + i}\t${l}`).join('\n');
      if (numbered.length > MAX_READ_BYTES) {
        numbered = numbered.slice(0, MAX_READ_BYTES) + '\n… [truncated — read a smaller line range]';
      }
      return { result: `FILE ${rel} (lines ${start}-${end} of ${lines.length}):\n${numbered}`, files: [] };
    }

    // ── write_file {path, content} — create or overwrite ────────────────
    case 'write_file': {
      const content = asString(call.args.content);
      if (content === null) return { result: 'TOOL ERROR: missing "content".', files: [] };
      const existed = existsSync(abs);
      if (existed) {
        // Snapshot the current version BEFORE overwriting so undo restores it.
        await snapshots.takeSnapshot([rel], `write_file ${rel}`).catch(() => {});
      }
      try {
        await fs.mkdir(dirname(abs), { recursive: true });
        await fs.writeFile(abs, content, 'utf-8');
      } catch (e) {
        return { result: `TOOL ERROR: cannot write ${rel}: ${e instanceof Error ? e.message : String(e)}`, files: [] };
      }
      const lineCount = content.split('\n').length;
      return {
        result: `OK: ${existed ? 'overwrote' : 'created'} ${rel} (${lineCount} lines).`,
        files: [rel],
      };
    }

    // ── edit_file {path, old, new, [all]} — exact substring replace ──────
    case 'edit_file': {
      const oldStr = asString(call.args.old);
      const newStr = asString(call.args.new);
      if (oldStr === null || newStr === null) {
        return { result: 'TOOL ERROR: edit_file requires string "old" and "new".', files: [] };
      }
      if (oldStr === newStr) {
        return { result: 'TOOL ERROR: "old" and "new" are identical — nothing to change.', files: [] };
      }
      if (!existsSync(abs)) return { result: `TOOL ERROR: file not found: ${rel}`, files: [] };
      let content: string;
      try {
        content = await fs.readFile(abs, 'utf-8');
      } catch (e) {
        return { result: `TOOL ERROR: cannot read ${rel}: ${e instanceof Error ? e.message : String(e)}`, files: [] };
      }
      const occurrences = countOccurrences(content, oldStr);
      if (occurrences === 0) {
        return { result: `TOOL ERROR: "old" string not found in ${rel}. Read the file and copy the exact text (including whitespace).`, files: [] };
      }
      const all = call.args.all === true;
      if (occurrences > 1 && !all) {
        return {
          result: `TOOL ERROR: "old" matches ${occurrences} places in ${rel}. Add surrounding context to make it unique, or set "all": true to replace every occurrence.`,
          files: [],
        };
      }
      // Snapshot BEFORE editing so undo restores the pre-edit version exactly.
      await snapshots.takeSnapshot([rel], `edit_file ${rel}`).catch(() => {});
      const updated = all
        ? content.split(oldStr).join(newStr)
        : content.replace(oldStr, newStr);
      try {
        await fs.writeFile(abs, updated, 'utf-8');
      } catch (e) {
        return { result: `TOOL ERROR: cannot write ${rel}: ${e instanceof Error ? e.message : String(e)}`, files: [] };
      }
      return {
        result: `OK: edited ${rel} (${all ? occurrences : 1} replacement${all && occurrences > 1 ? 's' : ''}).`,
        files: [rel],
      };
    }

    default:
      return { result: `TOOL ERROR: unknown built-in tool "${call.tool}".`, files: [] };
  }
}

// ── Native function-calling support ───────────────────────────────────────────

/** JSON-Schema definitions of the built-in file tools, for native tool calling. */
export const BUILTIN_TOOL_DEFS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read a file from the project, optionally a 1-based line range. Read before editing.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project-relative file path.' },
        start: { type: 'integer', description: 'First line to read (1-based).' },
        end: { type: 'integer', description: 'Last line to read (inclusive).' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create a new file or fully overwrite an existing one with exact content.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project-relative file path.' },
        content: { type: 'string', description: 'Full file content to write.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description:
      'Replace the exact substring "old" with "new" in a file. "old" must appear verbatim and be unique unless "all" is true.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project-relative file path.' },
        old: { type: 'string', description: 'Exact existing text to replace (include surrounding context to be unique).' },
        new: { type: 'string', description: 'Replacement text.' },
        all: { type: 'boolean', description: 'Replace every occurrence instead of requiring uniqueness.' },
      },
      required: ['path', 'old', 'new'],
    },
  },
];

/** Separator between an MCP server name and tool name in a native tool call. */
const MCP_SEP = '__';

/**
 * Build the full native tool list (built-in file tools + connected MCP tools)
 * and a router that maps each tool name back to how it should be executed.
 */
export function buildNativeTools(mcp: McpManager): {
  defs: ToolDefinition[];
  route: Map<string, { kind: 'builtin' } | { kind: 'mcp'; server: string; tool: string }>;
} {
  const route = new Map<string, { kind: 'builtin' } | { kind: 'mcp'; server: string; tool: string }>();
  const defs: ToolDefinition[] = [];

  for (const def of BUILTIN_TOOL_DEFS) {
    defs.push(def);
    route.set(def.name, { kind: 'builtin' });
  }

  for (const t of mcp.tools) {
    // Function names must match ^[a-zA-Z0-9_-]+$ — encode "server/tool" safely.
    const name = `${t.server}${MCP_SEP}${t.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const schema = (t.inputSchema && typeof t.inputSchema === 'object')
      ? (t.inputSchema as Record<string, unknown>)
      : { type: 'object', properties: {} };
    defs.push({ name, description: t.description.split('\n')[0], inputSchema: schema });
    route.set(name, { kind: 'mcp', server: t.server, tool: t.name });
  }

  return { defs, route };
}

/**
 * Execute a native tool call by name, routing to a built-in file tool or an
 * MCP server. Returns the text result plus any project files that changed.
 */
export async function dispatchNativeTool(
  name: string,
  args: Record<string, unknown>,
  route: Map<string, { kind: 'builtin' } | { kind: 'mcp'; server: string; tool: string }>,
  root: string,
  snapshots: SnapshotManager,
  mcp: McpManager,
): Promise<BuiltinToolResult> {
  const target = route.get(name);
  if (!target) return { result: `TOOL ERROR: unknown tool "${name}".`, files: [] };
  if (target.kind === 'builtin') {
    return executeBuiltinTool({ tool: name as BuiltinToolName, args }, root, snapshots);
  }
  try {
    const result = await mcp.callTool(target.server, target.tool, args);
    return { result, files: [] };
  } catch (e) {
    return { result: `TOOL ERROR: ${e instanceof Error ? e.message : String(e)}`, files: [] };
  }
}

/** System-prompt block describing the built-in file tools. */
export function builtinToolsBlock(): string {
  return [
    '## File tools (built-in — prefer these over shell for reading/editing files)',
    'Read and edit files directly and reliably with these tools instead of shell commands',
    '(cat/sed/tee). To call one, reply with ONLY a fenced block and nothing else:',
    '```vexi-tool',
    '{"tool": "edit_file", "path": "src/foo.ts", "old": "<exact text>", "new": "<replacement>"}',
    '```',
    'Available tools:',
    '- read_file {path, [start], [end]} — return file contents, optionally a 1-based line range. Read before editing.',
    '- write_file {path, content} — create a new file or fully overwrite an existing one with exact content.',
    '- edit_file {path, old, new, [all]} — replace the exact substring "old" with "new". "old" must appear verbatim '
      + 'and be unique unless you set "all": true. Include enough surrounding context to make "old" unique.',
    'The JSON must be valid: escape newlines as \\n and quotes as \\" inside string values. Do NOT include a "server" field '
      + '(that is reserved for MCP tools). You will receive the tool result in the next message; then continue.',
    'Still use `bash` shell blocks for non-editing work: installing deps, building, running tests, starting servers.',
  ].join('\n');
}
