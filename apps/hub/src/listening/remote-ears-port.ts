import type { EarCodec, EarSource } from '@smarteverything/domain';
import type { EarOptions } from '../wake-name/ear';

export interface RemoteEarOptions extends EarOptions {
  readonly source: EarSource;
  readonly codec: EarCodec;
}

export interface RemoteEar {
  readonly packet: (opus: Uint8Array) => void;
  readonly close: () => Promise<void>;
}

export interface RemoteEars {
  readonly open: (options: RemoteEarOptions) => Promise<RemoteEar>;
}
