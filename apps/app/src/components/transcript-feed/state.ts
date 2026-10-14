import type { TranscriptHit } from '@smarteverything/domain';

export interface TranscriptFeedState {
  readonly rows: readonly TranscriptHit[];
  readonly words: string;
  readonly settled: string;
  readonly context: boolean;
  readonly anchor: number | null;
  readonly missingAnchor: boolean;
  readonly error: Error | null;
  readonly loading: boolean;
  readonly fetching: boolean;
  readonly older: boolean;
  readonly newer: boolean;
  readonly loadingOlder: boolean;
  readonly loadingNewer: boolean;
  readonly loadOlder: () => void;
  readonly loadNewer: () => void;
  readonly refresh: () => void;
  readonly latest: () => void;
  readonly back: () => void;
  readonly changeWords: (value: string) => void;
  readonly open: (id: number) => void;
}
