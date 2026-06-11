/**
 * MCP server mode — Feature 6b (Vexi as MCP server, unique differentiator).
 *
 * `vexi --mcp-server` exposes Vexi's capabilities to OTHER AI agents
 * (Claude Desktop, Claude Code, Cursor, any MCP client) over stdio:
 *
 * Resources:
 *   vexi://project   project structure map (.vexi/project.json, rescanned)
 *   vexi://memory    compressed project memory — decisions & summary
 *   vexi://sessions  list of recorded sessions
 *
 * Tools:
 *   scan_project     rescan the project and return the map
 *   explain_code     explain any file/folder in en/ar/es/pt/fr
 *   project_memory   read the running summary + key decisions
 *
 * Example client config (Claude Desktop):
 *   { "mcpServers": { "vexi": { "command": "vexi", "args": ["--mcp-server"] } } }
 *
 * IMPORTANT: stdout is the JSON-RPC channel — never console.log here
 * (diagnostics go to stderr).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { loadConfig } from '../config.js';
import { createProvider } from '../providers/index.js';
import { scanProject, projectSummary } from '../scanner/index.js';
import { loadMemory, memoryBlock } from '../memory/index.js';
import { listSessions } from '../replay/recorder.js';
import { gatherSource, buildExplainMessages } from '../explain/index.js';
import { SUPPORTED_LANGS, type Lang } from '../i18n/index.js';

export async function runMcpServer(): Promise<void> {
  const root = process.cwd();
  const server = new McpServer({ name: 'vexi', version: '0.4.0' });

  // ── Resources ──────────────────────────────────────────────────────────
  server.registerResource(
    'project-map',
    'vexi://project',
    {
      title: 'Project map',
      description: 'Languages, stack, architecture layers and file list of the current project.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const map = await scanProject(root);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(map, null, 2) }] };
    },
  );

  server.registerResource(
    'project-memory',
    'vexi://memory',
    {
      title: 'Project memory',
      description: 'Compressed running summary and key decisions from past Vexi sessions.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const memory = await loadMemory(root);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(memory, null, 2) }] };
    },
  );

  server.registerResource(
    'sessions',
    'vexi://sessions',
    {
      title: 'Recorded sessions',
      description: 'List of recorded Vexi chat sessions (.vexi/sessions/).',
      mimeType: 'application/json',
    },
    async (uri) => {
      const sessions = await listSessions(root);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(sessions, null, 2) }] };
    },
  );

  // ── Tools ──────────────────────────────────────────────────────────────
  server.registerTool(
    'scan_project',
    {
      title: 'Scan project',
      description:
        'Scan the current project and return a compact structure summary (languages, stack, architecture layers).',
      inputSchema: {},
    },
    async () => {
      const map = await scanProject(root);
      return { content: [{ type: 'text', text: projectSummary(map) }] };
    },
  );

  server.registerTool(
    'project_memory',
    {
      title: 'Project memory',
      description: 'Return the compressed project memory: running summary + key decisions from past sessions.',
      inputSchema: {},
    },
    async () => {
      const memory = await loadMemory(root);
      const text = memoryBlock(memory) || 'No project memory recorded yet.';
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'explain_code',
    {
      title: 'Explain code',
      description: `Explain a file or folder in any supported language (${SUPPORTED_LANGS.join('/')}). Returns a structured Markdown explanation.`,
      inputSchema: {
        path: z.string().describe('File or folder path, relative to the project root or absolute'),
        language: z.enum(SUPPORTED_LANGS as [Lang, ...Lang[]]).default('en').describe('Output language'),
      },
    },
    async ({ path, language }) => {
      const config = await loadConfig();
      if (!config) {
        return {
          content: [{ type: 'text', text: 'No API key configured. Run `vexi` once in a terminal to set up.' }],
          isError: true,
        };
      }
      try {
        const provider = createProvider(config.provider, config.apiKey, config.model);
        const source = await gatherSource(path);
        const markdown = await provider.stream(buildExplainMessages(source, language), () => {});
        return { content: [{ type: 'text', text: markdown }] };
      } catch (e) {
        return {
          content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }],
          isError: true,
        };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Vexi MCP server running on stdio (project: ' + root + ')');
}
