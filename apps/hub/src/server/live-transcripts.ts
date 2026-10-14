import {
  TRANSCRIPT_NOTICE_CAPABILITY,
  type TranscriptChangedNotice,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { ownerProfileOf } from '../transcripts/owner';
import type { Subscription } from './live-dialect';
import type { Connection } from './live-visibility';

export class LiveTranscripts {
  private readonly observers = new Set<Connection>();
  private readonly unsubscribe: () => void;
  constructor(
    private readonly store: Store,
    private readonly send: (connection: Connection, notice: TranscriptChangedNotice) => void,
  ) {
    this.unsubscribe = store.feed.subscribeNotices((notice) => {
      if (notice.type !== 'transcript_changed') return;
      for (const connection of this.observers) {
        if (this.visible(connection, notice)) this.send(connection, notice);
      }
    });
  }
  observe(connection: Connection, message: Subscription['message']): void {
    if (message.capabilities?.includes(TRANSCRIPT_NOTICE_CAPABILITY) === true)
      this.observers.add(connection);
    else this.remove(connection);
  }
  remove(connection: Connection): void {
    this.observers.delete(connection);
  }
  stop(): void {
    this.unsubscribe();
    this.observers.clear();
  }
  private visible(connection: Connection, notice: TranscriptChangedNotice): boolean {
    const client = this.store.clients.list().find((row) => row.id === connection.client.id);
    if (client === undefined) return false;
    if (notice.source === 'camera')
      return this.store.cameras.list().some((camera) => camera.device_id === notice.source_id);
    return (
      client.role === 'owner' &&
      this.store.profiles.activeOf(connection.client.id).id === ownerProfileOf(this.store)
    );
  }
}
