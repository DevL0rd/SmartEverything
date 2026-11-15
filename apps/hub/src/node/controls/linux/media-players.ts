import type { MediaStatus, NowPlaying } from '@smarteverything/domain';
import type { SessionBus } from './dbus-session';

export interface MediaPlayers {
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  readonly current: () => NowPlaying | null;
  readonly control: (status: MediaStatus) => Promise<void>;
}

export type MediaPlayersFactory = (
  bus: SessionBus,
  changed: () => void,
  failed: (cause: unknown) => void,
) => MediaPlayers;
