import { Listeners } from '../listeners';
import type { Store } from '../store/store';
import type { DiscordVoice } from './computer-ears';

const DISCORD_CALL = /^discord:\d+:\d+:\d+$/;

export interface WatchedDiscordVoice extends DiscordVoice {
  readonly start: () => () => void;
}

export function discordVoiceOf(store: Pick<Store, 'transcripts' | 'feed'>): WatchedDiscordVoice {
  const open = new Set<string>();
  const changed = new Listeners<undefined>();
  const settle = (sessionId: string, operation: string): void => {
    const before = open.size > 0;
    const session = operation === 'delete' ? undefined : store.transcripts.find(sessionId);
    if (session?.ended_at === null) {
      open.add(sessionId);
    } else {
      open.delete(sessionId);
    }
    if (before !== open.size > 0) {
      changed.emit(undefined);
    }
  };
  return {
    inVoice: (): boolean => open.size > 0,
    changes: (listener): (() => void) =>
      changed.listen(() => {
        listener();
      }),
    start: (): (() => void) =>
      store.feed.subscribeNotices((notice) => {
        if (notice.type !== 'transcript_changed' || notice.plugin_id !== 'discord') {
          return;
        }
        if (DISCORD_CALL.test(notice.source_id)) {
          settle(notice.session_id, notice.operation);
        }
      }),
  };
}
