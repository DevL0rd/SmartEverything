import type { ServerResponse } from 'node:http';
import type { SettingsRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { EventStream } from './event-stream';

const LIST_CHANGED = JSON.stringify({
  jsonrpc: '2.0',
  method: 'notifications/tools/list_changed',
});

function switchesOf(row: SettingsRow | null): string {
  return row === null ? '' : row.mcp_disabled_tools.join(',');
}

export class ToolListFeed {
  private readonly streams = new Set<EventStream>();
  private readonly unsubscribe: () => void;

  constructor(store: Store) {
    this.unsubscribe = store.feed.subscribe((change) => {
      if (
        change.table === 'settings' &&
        switchesOf(change.record) !== switchesOf(change.oldRecord)
      ) {
        this.announce();
      }
    });
  }

  attach(response: ServerResponse): void {
    const stream = new EventStream(response);
    this.streams.add(stream);
    stream.onClose(() => {
      this.streams.delete(stream);
    });
  }

  stop(): void {
    this.unsubscribe();
    for (const stream of this.streams) {
      stream.close();
    }
  }

  private announce(): void {
    for (const stream of this.streams) {
      stream.send('message', LIST_CHANGED);
    }
  }
}
