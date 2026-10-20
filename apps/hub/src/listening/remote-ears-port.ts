import type { EarCodec, EarSource, WakeSensitivity } from '@smarteverything/domain';
import type { OnSuperseded, WakeClaimant } from '../wake-name/wake-claims';
import type { SpeechSegment } from './speech-segment';

export interface RemoteEarOptions {
  readonly source: EarSource;
  readonly codec: EarCodec;
  readonly claim: WakeClaimant;
  readonly fields: Readonly<Record<string, string>>;
  readonly sensitivity: () => WakeSensitivity;
  readonly resting: () => boolean;
  readonly wakes?: () => boolean;
  readonly names?: () => readonly string[];
  readonly wake:
    ((phrase: string, words: () => Int16Array, onSuperseded: OnSuperseded) => void) | null;
  readonly speech: ((segment: SpeechSegment) => void) | null;
}

export interface RemoteEar {
  readonly packet: (opus: Uint8Array) => void;
  readonly close: () => Promise<void>;
}

export interface RemoteEars {
  readonly open: (options: RemoteEarOptions) => Promise<RemoteEar>;
}
