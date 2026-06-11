/**
 * MCP client configuration — Feature 6a.
 *
 * External MCP servers are declared in ~/.vexi/mcp.json using the same
 * shape as Claude Desktop's config, so users can copy entries verbatim:
 *
 * {
 *   "mcpServers": {
 *     "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }
 *   }
 * }
 */

import { join } from 'node:path';
import { VEXI_DIR } from '../config.js';
import { readJson, writeJsonAtomic } from '../utils/fs-atomic.js';

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export const MCP_CONFIG_PATH = join(VEXI_DIR, 'mcp.json');

export async function loadMcpConfig(): Promise<McpConfig> {
  const config = await readJson<McpConfig>(MCP_CONFIG_PATH);
  if (!config || typeof config.mcpServers !== 'object' || config.mcpServers === null) {
    return { mcpServers: {} };
  }
  return config;
}

export async function saveMcpConfig(config: McpConfig): Promise<void> {
  // mode 600: server entries may carry env secrets (API tokens)
  await writeJsonAtomic(MCP_CONFIG_PATH, config, { mode: 0o600, dirMode: 0o700 });
}
