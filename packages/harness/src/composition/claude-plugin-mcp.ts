import type { StdioConfig, StreamableHttpConfig } from '@deepseek-ai/dsh-mcp-client';
import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';

const STRINGS = z.record(z.string(), z.string());
const STDIO = z.looseObject({
  type: z.literal('stdio').optional(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: STRINGS.optional(),
  cwd: z.string().optional(),
});
const HTTP = z.looseObject({
  type: z.literal('http'),
  url: z.string().min(1),
  headers: STRINGS.optional(),
});

export const MCP_SERVER = z.union([STDIO, HTTP]);
export const MCP_FILE = z.looseObject({
  mcpServers: z.record(z.string(), z.unknown()).optional(),
});
export type McpServerEntry = z.infer<typeof MCP_SERVER>;

type McpServerConfig =
  Omit<StdioConfig, 'failOnStartupError'> | Omit<StreamableHttpConfig, 'failOnStartupError'>;

const PLUGIN_ROOT = '${CLAUDE_PLUGIN_ROOT}';
const SERVER_NAME_MAX = 32;

export function mapMcpServer(
  entry: McpServerEntry,
  source: {
    readonly pluginName: string;
    readonly pluginRoot: string;
    readonly serverKey: string;
    readonly toolCallTimeoutMs: number;
  },
): McpServerConfig {
  const common = {
    serverName: serverName(source.pluginName, source.serverKey),
    toolCallTimeoutMs: source.toolCallTimeoutMs,
  };
  const inRoot = (value: string): string => value.replaceAll(PLUGIN_ROOT, source.pluginRoot);
  if (entry.type === 'http')
    return {
      ...common,
      transport: 'streamable-http',
      url: inRoot(entry.url),
      headers: Object.fromEntries(
        Object.entries(entry.headers ?? {}).map(([key, value]) => [key, inRoot(value)]),
      ),
    };
  return {
    ...common,
    transport: 'stdio',
    command: inRoot(entry.command),
    args: (entry.args ?? []).map(inRoot),
    env: Object.fromEntries(
      Object.entries(entry.env ?? {}).map(([key, value]) => [key, inRoot(value)]),
    ),
    cwd: inRoot(entry.cwd ?? ''),
  };
}

function serverName(pluginName: string, serverKey: string): string {
  const name = `${pluginName}-${serverKey}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, SERVER_NAME_MAX);
  if (name === '')
    throw new HarnessRuntimeError(
      'composition_incompatible',
      `No MCP server name can be derived from plugin "${pluginName}" and server "${serverKey}".`,
    );
  return name;
}
