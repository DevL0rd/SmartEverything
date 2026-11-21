import type { AiChatRow } from '@smarteverything/domain';
import { StoreNotFoundError } from './context';
import type { ChangeFeed } from './feed';
import type { StoreHost } from './host/host';
import { storeUnit } from './host/unit';
import { STORED_CHAT } from './repositories/ai-chat-helper-name';
import { CHAT_COLUMNS } from './repositories/ai-chats';

export class ChatMirrorNotLoadedError extends Error {
  override readonly name = 'ChatMirrorNotLoadedError';

  constructor() {
    super('The chat mirror was read before it was loaded from the store host.');
  }
}

export const CHAT_MIRROR_UNIT = storeUnit((store, _input: null): AiChatRow[] =>
  store.context.sql.all(STORED_CHAT, `select ${CHAT_COLUMNS}, native_admission from ai_chats`),
);

export class ChatMirror {
  private readonly rows = new Map<string, AiChatRow>();
  private readonly removed = new Set<string>();
  private loading: Promise<void> | null = null;
  private ready = false;

  constructor(
    feed: ChangeFeed,
    private readonly host: StoreHost,
  ) {
    feed.subscribe((change) => {
      if (change.table !== 'ai_chats') return;
      if (change.record !== null) {
        this.rows.set(change.record.id, change.record);
        this.removed.delete(change.record.id);
      } else if (change.oldRecord !== null) {
        this.rows.delete(change.oldRecord.id);
        if (!this.ready) this.removed.add(change.oldRecord.id);
      }
    });
  }

  load(): Promise<void> {
    this.loading ??= this.fill();
    return this.loading;
  }

  chat(id: string): AiChatRow {
    const row = this.find(id);
    if (row === undefined) throw new StoreNotFoundError('AI chat', id);
    return row;
  }

  find(id: string): AiChatRow | undefined {
    if (!this.ready) throw new ChatMirrorNotLoadedError();
    return this.rows.get(id);
  }

  private async fill(): Promise<void> {
    const rows = await this.host.read('chatMirror', null);
    for (const row of rows)
      if (!this.rows.has(row.id) && !this.removed.has(row.id)) this.rows.set(row.id, row);
    this.removed.clear();
    this.ready = true;
  }
}
