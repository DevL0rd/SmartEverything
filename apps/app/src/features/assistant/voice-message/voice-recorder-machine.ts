import type { PickedFile } from '../../../platform/pick-files';
import { voiceMessageFile } from './voice-message-file';

export const VOICE_MESSAGE_MIN_MS = 1000;

export type RecorderPhase = 'idle' | 'requesting' | 'recording' | 'saving';

export interface RecorderDevice {
  readonly permission: () => Promise<boolean>;
  readonly begin: () => Promise<void>;
  readonly end: () => Promise<string | null>;
  readonly abort: () => Promise<void>;
  readonly elapsedMs: () => number;
  readonly read: (uri: string) => Promise<ArrayBuffer>;
}

export type RecorderOutcome =
  | { readonly kind: 'file'; readonly file: PickedFile }
  | { readonly kind: 'too_short' }
  | { readonly kind: 'empty' };

export interface RecorderSnapshot {
  readonly phase: RecorderPhase;
  readonly denied: boolean;
}

export class VoiceRecorderMachine {
  private snapshot: RecorderSnapshot = { phase: 'idle', denied: false };
  private generation = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly device: RecorderDevice,
    private readonly now: () => Date,
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly read = (): RecorderSnapshot => this.snapshot;

  async start(): Promise<void> {
    if (this.snapshot.phase !== 'idle') {
      return;
    }
    const generation = (this.generation += 1);
    this.set({ phase: 'requesting' });
    try {
      const granted = await this.device.permission();
      this.set({ denied: !granted });
      if (granted && generation === this.generation) {
        await this.device.begin();
        if (generation === this.generation) {
          this.set({ phase: 'recording' });
          return;
        }
        await this.device.abort();
      }
    } catch (cause) {
      await this.device.abort();
      this.set({ phase: 'idle' });
      throw cause;
    }
    this.set({ phase: 'idle' });
  }

  async finish(): Promise<RecorderOutcome> {
    if (this.snapshot.phase !== 'recording') {
      return { kind: 'empty' };
    }
    this.generation += 1;
    this.set({ phase: 'saving' });
    try {
      const elapsed = this.device.elapsedMs();
      const uri = await this.device.end();
      if (elapsed < VOICE_MESSAGE_MIN_MS) {
        return { kind: 'too_short' };
      }
      if (uri === null) {
        return { kind: 'empty' };
      }
      return { kind: 'file', file: voiceMessageFile(await this.device.read(uri), this.now()) };
    } finally {
      this.set({ phase: 'idle' });
    }
  }

  async cancel(): Promise<void> {
    const { phase } = this.snapshot;
    if (phase === 'requesting') {
      this.generation += 1;
    } else if (phase === 'recording') {
      this.generation += 1;
      this.set({ phase: 'idle' });
      await this.device.abort();
    }
  }

  private set(change: Partial<RecorderSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}
