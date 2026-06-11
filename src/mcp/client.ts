/**
 * MCP client — Feature 6a (Vexi as MCP client).
 *
 * Connects to the stdio MCP servers configured in ~/.vexi/mcp.json and
 * exposes their tools to the chat agent. Because Vexi is provider-agnostic
 * (no native function-calling API), tool use is text-based: the model is
 * shown the available tools in the system prompt and replies with a fenced
 * ```vexi-tool``` JSON block, which the agent parses and executes here.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadMcpConfig } from './config.js';

export interface McpTool {
  server: string;
  name: string;
  description: string;
  inputSchema: unknown;
}

interface Connection {
  name: string;
  client: Client;
}

export class McpManager {
  private connections: Connection[] = [];
  readonly tools: McpTool[] = [];

  /** Connect to every configured server (errors are collected, not thrown). */
  async connect(): Promise<{ connected: string[]; failed: Array<{ name: string; error: string }> }> {
    const config = await loadMcpConfig();
    const connected: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    for (const [name, server] of Object.entries(config.mcpServers)) {
      try {
        const transport = new StdioClientTransport({
          command: server.command,
          args: server.args ?? [],
          env: { ...(process.env as Record<string, string>), ...server.env },
          stderr: 'ignore',
        });
        const client = new Client({ name: 'vexi', version: '0.4.0' });
        await client.connect(transport);

        const { tools } = await client.listTools();
        for (const tool of tools) {
          this.tools.push({
            server: name,
            name: tool.name,
            description: tool.description ?? '',
            inputSchema: tool.inputSchema,
          });
        }
        this.connections.push({ name, client });
        connected.push(name);
      } catch (e) {
        failed.push({ name, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { connected, failed };
  }

  /** Call a tool on a connected server; returns the text result. */
  async callTool(server: string, tool: string, args: Record<string, unknown>): Promise<string> {
    const connection = this.connections.find((c) => c.name === server);
    if (!connection) throw new Error(`MCP server "${server}" is not connected.`);

    const result = await connection.client.callTool({ name: tool, arguments: args });
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .map((c: { type: string; text?: string }) => (c.type === 'text' ? (c.text ?? '') : `[${c.type}]`))
      .join('\n');
    return result.isError ? `TOOL ERROR: ${text}` : text;
  }

  /** System-prompt block describing the available tools ('' when none). */
  promptBlock(): string {
    if (this.tools.length === 0) return '';
    const list = this.tools
      .map((t) => `- ${t.server}/${t.name}: ${t.description.split('\n')[0]}\n  input schema: ${JSON.stringify(t.inputSchema)}`)
      .join('\n');
    return [
      '## External tools (MCP)',
      'You can call these tools. To call one, reply with ONLY a fenced block:',
      '```vexi-tool',
      '{"server": "<server>", "tool": "<name>", "arguments": { ... }}',
      '```',
      'You will receive the tool result in the next message; then continue.',
      'Available tools:',
      list,
    ].join('\n');
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.connections.map((c) => c.client.close()));
    this.connections = [];
  }
}

/** Parse a ```vexi-tool``` call from a model reply, or null. */
export function parseToolCall(
  reply: string,
): { server: string; tool: string; arguments: Record<string, unknown> } | null {
  const match = reply.match(/```vexi-tool\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const json = JSON.parse(match[1]);
    if (typeof json.server === 'string' && typeof json.tool === 'string') {
      return { server: json.server, tool: json.tool, arguments: json.arguments ?? {} };
    }
  } catch {
    // fall through
  }
  return null;
}
