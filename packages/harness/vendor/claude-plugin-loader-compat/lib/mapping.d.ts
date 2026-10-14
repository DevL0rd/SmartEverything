/**
 * Pure Claude-to-harness conversions: slash-command template rendering,
 * `.mcp.json` server mapping, and command-definition construction. Every
 * function here is total over its validated inputs and free of cordis
 * effects, so the mapping rules are testable in isolation.
 * @module @deepseek-ai/dsh-claude-plugin-loader/mapping
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client';
import type { ClaudeCommandFile } from './manifest.ts';
/**
 * Render a command body for one invocation, matching Claude Code's argument
 * rules: `$ARGUMENTS` receives the full input, positional `$1`…`$9` receive
 * whitespace-split arguments (missing ones become the empty string), and a
 * body referencing neither appends the input when non-empty.
 * @param body - prompt template.
 * @param rawInput - exact text following the command name, separator whitespace included.
 * @param pluginRoot - the plugin's absolute root directory.
 * @returns the rendered prompt text.
 */
export declare function renderCommandBody(body: string, rawInput: string, pluginRoot: string): string;
/**
 * Derive a valid MCP `serverName` namespace from a plugin name and server key.
 * The name is lowercased, restricted to `[a-z0-9_-]`, collapsed, truncated to
 * 32 characters, and must not come out empty.
 * @param pluginName - the plugin's manifest name.
 * @param serverKey - the server's key in `.mcp.json`.
 * @returns the sanitized server name.
 */
export declare function sanitizeMcpServerName(pluginName: string, serverKey: string): string;
/** Outcome of mapping one `.mcp.json` server entry. */
export type McpMountResult = {
    readonly kind: 'mount';
    readonly config: McpClientConfig;
} | {
    readonly kind: 'skip';
    readonly reason: string;
};
/**
 * Map one raw `.mcp.json` server entry to an `mcp-client` plugin config.
 * `stdio` (the default) maps to a stdio child process, `http` to Streamable
 * HTTP, and `sse` — which the harness has no transport for — is skipped.
 * `${CLAUDE_PLUGIN_ROOT}` is substituted in `command`, `args`, `env`, `cwd`,
 * `url`, and header values. Malformed entries throw.
 * @param entry - raw JSON server entry.
 * @param options - plugin identity, server key, and forwarded client tunables.
 * @returns the mapped mount or a documented skip.
 */
export declare function mapMcpServer(entry: Readonly<Record<string, unknown>>, options: {
    readonly pluginName: string;
    readonly pluginRoot: string;
    readonly serverKey: string;
    /** Per-tool-call timeout forwarded to the mounted MCP client (ms). */
    readonly toolCallTimeoutMs: number;
    /** Whether an MCP startup failure fails the loader activation. */
    readonly failOnStartupError: boolean;
}): McpMountResult;
/**
 * Build a harness slash-command definition for one parsed Claude command.
 * Invocation renders the template body and steers it into the receiving
 * agent as a user message, exactly like a typed command line.
 * @param command - parsed command file.
 * @param pluginRoot - the plugin's absolute root directory.
 * @returns the command definition.
 */
export declare function buildCommandDefinition(command: ClaudeCommandFile, pluginRoot: string): CommandDefinition;
