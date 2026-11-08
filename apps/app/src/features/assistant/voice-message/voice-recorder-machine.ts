import type { PickedFile } from '../../../platform/pick-files';
import { voiceMessageFile } from './voice-message-file';

export const VOICE_MESSAGE_MIN_MS = 1000;
export const LEVEL_SAMPLE_MS = 50;
export const METERING_FLOOR_DB = -60;

const MS_PER_SECOND = 1000;
const LEVEL_MAX = 255;

export type RecorderPhase = 'idle' | 'requesting' | 'recording' | 'paused' | 'saving' | 'preview';

export interface RecordedVoice {
  readonly data: ArrayBuffer;
  readonly mime: string;
}

export interface RecorderDevice {
  readonly permission: () => Promise<boolean>;
  readonly begin: () => Promise<void>;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly end: () => Promise<string | null>;
  readonly abort: () => Promise<void>;
  readonly elapsedMs: () => number;
  readonly meteringDb: () => number | null;
  readonly read: (uri: string) => Promise<RecordedVoice>;
}

export interface FrameScheduler {
  readonly request: (run: () => void) => number;
  readonly cancel: (handle: number) => void;
}

export interface LevelFrame {
  readonly level: number;
  readonly elapsedMs: number;
}

export interface RecordedClip {
  readonly uri: string;
  readonly durationMs: number;
  readonly levels: readonly number[];
  readonly peak: number;
}

export type RecorderOutcome =
  | { readonly kind: 'file'; readonly file: PickedFile }
  | { readonly kind: 'too_short' }
  | { readonly kind: 'empty' };

export type StopOutcome =
  { readonly kind: 'preview' } | { readonly kind: 'too_short' } | { readonly kind: 'empty' };

export interface RecorderSnapshot {
  readonly phase: RecorderPhase;
  readonly denied: boolean;
  readonly locked: boolean;
  readonly seconds: number;
  readonly clip: RecordedClip | null;
}

type Sealed =
  | { readonly kind: 'clip'; readonly clip: RecordedClip }
  | { readonly kind: 'too_short' }
  | { readonly kind: 'empty' };

const IDLE: RecorderSnapshot = {
  phase: 'idle',
  denied: false,
  locked: false,
  seconds: 0,
  clip: null,
};

const IDLE_KEEPING_DENIAL: Partial<RecorderSnapshot> = {
  phase: 'idle',
  locked: false,
  seconds: 0,
  clip: null,
};

export function levelOf(db: number | null): number {
  if (db === null) {
    return 0;
  }
  return Math.min(1, Math.max(0, (db - METERING_FLOOR_DB) / -METERING_FLOOR_DB));
}

export class LevelSeries {
  private samples: number[] = [];
  private top = 0;

  reset(): void {
    this.samples = [];
    this.top = 0;
  }

  fill(elapsedMs: number, level: number): void {
    this.top = Math.max(this.top, level);
    const sample = Math.round(level * LEVEL_MAX);
    const target = Math.floor(elapsedMs / LEVEL_SAMPLE_MS);
    while (this.samples.length < target) {
      this.samples.push(sample);
    }
  }

  values(): readonly number[] {
    return [...this.samples];
  }

  peak(): number {
    return this.top;
  }
}

export class LevelReader {
  private handle: number | null = null;

  constructor(
    private readonly frames: FrameScheduler,
    private readonly observe: () => void,
  ) {}

  get running(): boolean {
    return this.handle !== null;
  }

  start(): void {
    this.handle ??= this.frames.request(this.tick);
  }

  stop(): void {
    if (this.handle !== null) {
      this.frames.cancel(this.handle);
      this.handle = null;
    }
  }

  private readonly tick = (): void => {
    this.observe();
    this.handle = this.frames.request(this.tick);
  };
}

function isLive(phase: RecorderPhase): boolean {
  return phase === 'recording' || phase === 'paused';
}

export class VoiceRecorderMachine {
  private snapshot: RecorderSnapshot = IDLE;
  private generation = 0;
  private visible = false;
  private lastElapsedMs = 0;
  private readonly series = new LevelSeries();
  private readonly reader: LevelReader;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly device: RecorderDevice,
    private readonly now: () => Date,
    frames: FrameScheduler,
    private readonly onLevel: (frame: LevelFrame) => void,
  ) {
    this.reader = new LevelReader(frames, () => {
      this.observe();
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly read = (): RecorderSnapshot => this.snapshot;

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.sync();
  }

  async start(): Promise<void> {
    if (this.snapshot.phase !== 'idle') {
      return;
    }
    const generation = (this.generation += 1);
    this.series.reset();
    this.lastElapsedMs = 0;
    this.set({ phase: 'requesting' });
    try {
      const granted = await this.device.permission();
      this.set({ denied: !granted });
      if (granted && generation === this.generation) {
        await this.device.begin();
        if (generation === this.generation) {
          this.set({ phase: 'recording', locked: false, seconds: 0, clip: null });
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

  pause(): void {
    if (this.snapshot.phase !== 'recording') {
      return;
    }
    this.observe();
    this.device.pause();
    this.set({ phase: 'paused' });
  }

  resume(): void {
    if (this.snapshot.phase !== 'paused') {
      return;
    }
    this.device.resume();
    this.set({ phase: 'recording' });
  }

  lock(): void {
    if (isLive(this.snapshot.phase) && !this.snapshot.locked) {
      this.set({ locked: true });
    }
  }

  async stop(): Promise<StopOutcome> {
    if (!isLive(this.snapshot.phase)) {
      return { kind: 'empty' };
    }
    try {
      const sealed = await this.seal();
      if (sealed.kind === 'clip') {
        this.set({ phase: 'preview', clip: sealed.clip });
        return { kind: 'preview' };
      }
      this.set(IDLE_KEEPING_DENIAL);
      return sealed;
    } catch (cause) {
      this.set(IDLE_KEEPING_DENIAL);
      throw cause;
    }
  }

  async finish(): Promise<RecorderOutcome> {
    const { phase, clip } = this.snapshot;
    try {
      if (phase === 'preview' && clip !== null) {
        this.set({ phase: 'saving' });
        return await this.fileOf(clip);
      }
      if (!isLive(phase)) {
        return { kind: 'empty' };
      }
      const sealed = await this.seal();
      return sealed.kind === 'clip' ? await this.fileOf(sealed.clip) : sealed;
    } finally {
      if (phase === 'preview' || isLive(phase)) {
        this.set(IDLE_KEEPING_DENIAL);
      }
    }
  }

  async cancel(): Promise<void> {
    const { phase } = this.snapshot;
    if (phase === 'requesting') {
      this.generation += 1;
    } else if (isLive(phase)) {
      this.generation += 1;
      this.set(IDLE_KEEPING_DENIAL);
      await this.device.abort();
    } else if (phase === 'preview') {
      this.set(IDLE_KEEPING_DENIAL);
    }
  }

  async dispose(): Promise<void> {
    this.setVisible(false);
    await this.cancel();
  }

  private async seal(): Promise<Sealed> {
    this.generation += 1;
    this.set({ phase: 'saving' });
    const elapsed = this.device.elapsedMs();
    this.series.fill(elapsed, levelOf(this.device.meteringDb()));
    const uri = await this.device.end();
    if (elapsed < VOICE_MESSAGE_MIN_MS) {
      return { kind: 'too_short' };
    }
    if (uri === null) {
      return { kind: 'empty' };
    }
    return {
      kind: 'clip',
      clip: {
        uri,
        durationMs: elapsed,
        levels: this.series.values(),
        peak: this.series.peak(),
      },
    };
  }

  private async fileOf(clip: RecordedClip): Promise<RecorderOutcome> {
    const recording = await this.device.read(clip.uri);
    return {
      kind: 'file',
      file: voiceMessageFile(recording.data, this.now(), recording.mime, clip.levels),
    };
  }

  private observe(): void {
    const elapsedMs = this.device.elapsedMs();
    const level = levelOf(this.device.meteringDb());
    this.lastElapsedMs = elapsedMs;
    this.series.fill(elapsedMs, level);
    this.onLevel({ level, elapsedMs });
    const seconds = Math.floor(elapsedMs / MS_PER_SECOND);
    if (seconds !== this.snapshot.seconds) {
      this.set({ seconds });
    }
  }

  private sync(): void {
    const reading = this.snapshot.phase === 'recording' && this.visible;
    if (reading) {
      this.reader.start();
    } else if (this.reader.running) {
      this.reader.stop();
      this.onLevel({ level: 0, elapsedMs: this.lastElapsedMs });
    }
  }

  private set(change: Partial<RecorderSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.sync();
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}
