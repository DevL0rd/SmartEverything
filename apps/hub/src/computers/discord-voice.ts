import { Logger } from '@smarteverything/logging';
import { Listeners } from '../listeners';
import type { Store } from '../store/store';
import type { DiscordVoice } from './computer-ears';

const DISCORD_CALL = /^discord:\d+:\d+:\d+$/;

const log = new Logger('hub.computers');

export interface WatchedDiscordVoice extends DiscordVoice {
  readonly start: () => () => void;
  readonly settled: () => Promise<void>;
}

export function discordVoiceOf(store: Pick<Store, 'host' | 'feed'>): WatchedDiscordVoice {
  const open = new Set<string>();
  const changed = new Listeners<undefined>();
  let settling: Promise<void> = Promise.resolve();
  const settle = async (sessionId: string, operation: string): Promise<void> => {
    const session =
      operation === 'delete' ? undefined : await store.host.call('transcripts', 'find', sessionId);
    const before = open.size > 0;
    if (session?.ended_at === null) {
      open.add(sessionId);
    } else {
      open.delete(sessionId);
    }
    if (before !== open.size > 0) {
      changed.emit(undefined);
    }
  };
  const queue = (sessionId: string, operation: string): void => {
    settling = settling
      .then(() => settle(sessionId, operation))
      .catch((cause: unknown) => {
        log.error('computer.discord_voice_settle_failed', cause, { sessionId });
      });
  };
  return {
    inVoice: (): boolean => open.size > 0,
    changes: (listener): (() => void) =>
      changed.listen(() => {
        listener();
      }),
    settled: (): Promise<void> => settling,
    start: (): (() => void) =>
      store.feed.subscribeNotices((notice) => {
        if (notice.type !== 'transcript_changed' || notice.plugin_id !== 'discord') {
          return;
        }
        if (DISCORD_CALL.test(notice.source_id)) {
          queue(notice.session_id, notice.operation);
        }
      }),
  };
}
