/**
 * Phase 4 smoke tests: dependency graph, graph HTML, MCP config,
 * tool-call parsing, and a real MCP server e2e over stdio.
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGraph } from '../dist/graph/index.js';
import { buildGraphHtml } from '../dist/graph/html.js';
import { parseToolCall } from '../dist/mcp/client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let failed = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failed++;
};

// ── Fixture project ──
const root = mkdtempSync(join(tmpdir(), 'vexi-p4-'));
mkdirSync(join(root, 'src', 'lib'), { recursive: true });
writeFileSync(join(root, 'package.json'), '{}');
writeFileSync(join(root, 'src', 'util.ts'), 'export const u = 1;');
writeFileSync(join(root, 'src', 'lib', 'db.ts'), "import { u } from '../util.js';\nexport const db = u;");
writeFileSync(join(root, 'src', 'lib', 'index.ts'), "export * from './db.js';");
writeFileSync(
  join(root, 'src', 'app.ts'),
  "import { db } from './lib/index.js';\nimport express from 'express';\nconst x = require('chalk');\nexport default db;",
);

// ── Graph builder ──
const graph = await buildGraph(root);
const edge = (s, t) => graph.edges.some((e) => e.source === s && e.target === t);
check('graph: resolves .js → .ts', edge('src/lib/db.ts', 'src/util.ts'));
check('graph: resolves index files', edge('src/app.ts', 'src/lib/index.ts'));
check('graph: re-export edge', edge('src/lib/index.ts', 'src/lib/db.ts'));
check('graph: externals counted', graph.externals.some((e) => e.name === 'express') && graph.externals.some((e) => e.name === 'chalk'));
const util = graph.nodes.find((n) => n.id === 'src/util.ts');
check('graph: impact is transitive', util.impact === 3); // db, index, app
check('graph: dependents direct', util.dependents === 1);

// ── Graph HTML ──
const html = buildGraphHtml(graph, 'en');
check('graph html: standalone + d3', html.startsWith('<!DOCTYPE html>') && html.includes('cdn.jsdelivr.net/npm/d3@7'));
check('graph html: embeds data', html.includes('src/util.ts') && html.includes('transitiveDependents'));
check('graph html: rtl for ar', buildGraphHtml(graph, 'ar').includes('dir="rtl"'));

// ── Tool-call parsing ──
const call = parseToolCall('Let me check.\n```vexi-tool\n{"server":"github","tool":"get_issue","arguments":{"id":5}}\n```');
check('mcp: parses tool call', call?.server === 'github' && call.tool === 'get_issue' && call.arguments.id === 5);
check('mcp: no call → null', parseToolCall('plain answer with ```js\ncode\n```') === null);
check('mcp: bad json → null', parseToolCall('```vexi-tool\n{nope}\n```') === null);

// ── MCP server e2e over stdio (spawns the real CLI) ──
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(process.cwd(), 'dist', 'index.js'), '--mcp-server'],
  cwd: root,
  stderr: 'ignore',
});
const client = new Client({ name: 'test', version: '0.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
const toolNames = tools.map((t) => t.name).sort();
check('mcp server: exposes tools', JSON.stringify(toolNames) === JSON.stringify(['explain_code', 'project_memory', 'scan_project']));

const { resources } = await client.listResources();
const uris = resources.map((r) => r.uri).sort();
check('mcp server: exposes resources', JSON.stringify(uris) === JSON.stringify(['vexi://memory', 'vexi://project', 'vexi://sessions']));

const scan = await client.callTool({ name: 'scan_project', arguments: {} });
check('mcp server: scan_project works', scan.content[0].text.includes('TypeScript'));

const mem = await client.callTool({ name: 'project_memory', arguments: {} });
check('mcp server: project_memory works', mem.content[0].text.includes('No project memory'));

const res = await client.readResource({ uri: 'vexi://project' });
check('mcp server: resource readable', JSON.parse(res.contents[0].text).files.includes('src/app.ts'));

await client.close();
rmSync(root, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
