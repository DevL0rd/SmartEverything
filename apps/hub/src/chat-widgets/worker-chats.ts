import type { AssistantMessageRow, LiveChange } from '@smarteverything/domain';
import type { McpToolCall } from '../extensions/mcp/call-feed';
import type { Store } from '../store/store';

export interface WorkerChatLink {
  readonly chatFor: (call: McpToolCall) => string | null;
}

const OPEN_STATES: ReadonlySet<AssistantMessageRow['state']> = new Set(['delivered', 'working']);

function personRow(change: LiveChange): AssistantMessageRow | null {
  if (change.table !== 'assistant_messages') {
    return null;
  }
  const row = change.record ?? change.oldRecord;
  return row?.role === 'person' ? row : null;
}

export class OpenWorkerChats implements WorkerChatLink {
  private readonly open = new Map<string, string>();

  constructor(private readonly store: Store) {}

  start(): () => void {
    return this.store.feed.subscribe((change) => {
      const row = personRow(change);
      if (row !== null) {
        this.track(row, change.operation !== 'DELETE');
      }
    });
  }

  chatFor(): string | null {
    const chats = [...new Set(this.open.values())];
    const [only] = chats;
    return chats.length === 1 && only !== undefined ? only : null;
  }

  private track(row: AssistantMessageRow, present: boolean): void {
    if (present && OPEN_STATES.has(row.state) && this.byWorker(row.chat_id)) {
      this.open.set(row.id, row.chat_id);
    } else {
      this.open.delete(row.id);
    }
  }

  private byWorker(chatId: string): boolean {
    return this.store.aiChats.chat(chatId).engine.kind !== 'openrouter';
  }
}
