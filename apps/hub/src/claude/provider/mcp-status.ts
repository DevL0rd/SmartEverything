import type { McpServerStatus } from '@anthropic-ai/claude-agent-sdk';
import type { JsonValue } from '@smarteverything/domain';
import { jsonOf } from './control';

export function mcpStatusValue(servers: readonly McpServerStatus[]): JsonValue {
  return jsonOf(
    servers.map((server) => {
      const { config, ...status } = server;
      if (config === undefined) return status;
      if ('url' in config) {
        const url = new URL(config.url);
        url.username = '';
        url.password = '';
        url.search = '';
        return { ...status, config: { type: config.type, url: url.href } };
      }
      return { ...status, config: { type: config.type ?? 'stdio' } };
    }),
  );
}
