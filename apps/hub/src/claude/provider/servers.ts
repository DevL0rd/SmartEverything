import type { Query } from '@anthropic-ai/claude-agent-sdk';
import type { JobLog } from './job-log';

export class ProviderServers {
  readonly blocked = new Set<string>();
  readonly native = new Set<string>();
  readonly builtin = new Set<string>();

  async refresh(query: Query, native: boolean, trace: JobLog): Promise<void> {
    const statuses = await query.mcpServerStatus();
    trace.mcpRefreshed(statuses.length, native);
    for (const server of statuses) {
      if (server.name === 'home') continue;
      if (server.serverInfo?.name.toLowerCase() === 'smarteverything')
        this.blocked.add(server.name);
      else if (native) this.native.add(server.name);
    }
  }
}
