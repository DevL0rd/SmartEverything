import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SettingsRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import { statelessHttp } from './http-transport';
import { notifierServer } from './server';

function switchesOf(row: SettingsRow | null): string {
  return row === null ? '' : row.mcp_disabled_tools.join(',');
}

export class ToolListFeed {
  private readonly streams = new Set<McpServer>();
  private readonly unsubscribe: () => void;

  constructor(
    store: Store,
    private readonly log: Logger,
  ) {
    this.unsubscribe = store.feed.subscribe((change) => {
      if (
        change.table === 'settings' &&
        switchesOf(change.record) !== switchesOf(change.oldRecord)
      ) {
        this.announce();
      }
    });
  }

  async attach(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const stream = notifierServer();
    this.streams.add(stream);
    response.once('close', () => {
      this.streams.delete(stream);
      this.closing(stream);
    });
    const http = statelessHttp(false);
    await stream.connect(http.transport);
    await http.handle(request, response);
  }

  stop(): void {
    this.unsubscribe();
    for (const stream of this.streams) {
      this.closing(stream);
    }
  }

  private announce(): void {
    for (const stream of this.streams) {
      stream.server.sendToolListChanged().catch((cause: unknown) => {
        this.log.error('tool_list_changed.failed', cause);
      });
    }
  }

  private closing(stream: McpServer): void {
    stream.close().catch((cause: unknown) => {
      this.log.error('stream.close_failed', cause);
    });
  }
}
