import {
  SIGHT_SAMPLING,
  sightKindOf,
  type AppSightSource,
  type SightKind,
  type SightSampling,
} from '@smarteverything/domain';
import { FrameRenderer } from './sight-render';

const CHANGE_THRESHOLD: Readonly<Record<SightKind, number>> = {
  camera: 0.02,
  screen: 0.004,
  window: 0.004,
};

const CAMERA_HEARTBEAT_MS = 5000;

export interface SamplerLimits {
  readonly maxBytes: number;
  readonly minIntervalMs: number;
}

export interface SamplerHandlers {
  readonly open: () => boolean;
  readonly send: (jpeg: Uint8Array) => void;
  readonly failure: (error: unknown) => void;
}

interface WaitingStill {
  readonly after: number;
  readonly resolve: (jpeg: Uint8Array) => void;
  readonly reject: (error: unknown) => void;
}

export class SightSampler {
  private readonly renderer = new FrameRenderer();
  private readonly stills = new FrameRenderer();
  private readonly reader: ReadableStreamDefaultReader<VideoFrame>;
  private readonly sampling: SightSampling;
  private readonly minIntervalMs: number;
  private readonly kind: SightKind;
  private latest: VideoFrame | null = null;
  private seen = 0;
  private streaming = false;
  private rendering = false;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private trailing: ReturnType<typeof setTimeout> | null = null;
  private waiting: WaitingStill[] = [];
  private stopped = false;

  constructor(
    track: MediaStreamTrack,
    source: AppSightSource,
    private readonly limits: SamplerLimits,
    private readonly handlers: SamplerHandlers,
  ) {
    this.sampling = SIGHT_SAMPLING[source];
    this.minIntervalMs = Math.max(this.sampling.minIntervalMs, limits.minIntervalMs);
    this.kind = sightKindOf(source);
    this.reader = new MediaStreamTrackProcessor<VideoFrame>({ track }).readable.getReader();
    this.run().catch(handlers.failure);
  }

  setStreaming(on: boolean): void {
    if (this.streaming === on) {
      return;
    }
    this.streaming = on;
    this.renderer.forget();
    if (on) {
      this.consider();
    } else {
      this.clearTrailing();
    }
  }

  still(afterFrames: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      this.waiting.push({ after: this.seen + afterFrames, resolve, reject });
      this.serveStills();
    });
  }

  stop(): void {
    this.stopped = true;
    this.clearTrailing();
    this.latest?.close();
    this.latest = null;
    this.reader.cancel().catch(this.handlers.failure);
    const waiting = this.waiting;
    this.waiting = [];
    waiting.forEach((still) => {
      still.reject(new Error('The picture source stopped before a picture arrived'));
    });
  }

  private async run(): Promise<void> {
    for (let read = await this.reader.read(); !read.done; read = await this.reader.read()) {
      if (this.stopped) {
        read.value.close();
        return;
      }
      this.latest?.close();
      this.latest = read.value;
      this.seen += 1;
      this.serveStills();
      this.consider();
    }
  }

  private serveStills(): void {
    const frame = this.latest;
    if (frame === null) {
      return;
    }
    const ready = this.waiting.filter((still) => this.seen >= still.after);
    if (ready.length === 0) {
      return;
    }
    this.waiting = this.waiting.filter((still) => this.seen < still.after);
    const copy = frame.clone();
    this.stills
      .jpeg(copy, this.sampling, this.limits.maxBytes)
      .then(
        (jpeg) => {
          ready.forEach((still) => {
            still.resolve(jpeg);
          });
        },
        (error: unknown) => {
          ready.forEach((still) => {
            still.reject(error);
          });
        },
      )
      .finally(() => {
        copy.close();
      });
  }

  private consider(): void {
    if (!this.streaming || this.rendering || !this.handlers.open()) {
      return;
    }
    const wait = this.minIntervalMs - (performance.now() - this.lastSentAt);
    if (wait <= 0) {
      this.clearTrailing();
      this.emit().catch(this.handlers.failure);
    } else {
      this.trailing ??= setTimeout(() => {
        this.trailing = null;
        this.consider();
      }, wait);
    }
  }

  private async emit(): Promise<void> {
    const latest = this.latest;
    if (latest === null) {
      return;
    }
    const frame = latest.clone();
    this.rendering = true;
    try {
      const glance = this.renderer.glance(frame);
      const now = performance.now();
      const beat = this.kind === 'camera' && now - this.lastSentAt >= CAMERA_HEARTBEAT_MS;
      if (beat || this.renderer.differs(glance, CHANGE_THRESHOLD[this.kind])) {
        this.lastSentAt = now;
        this.renderer.remember(glance);
        this.handlers.send(await this.renderer.jpeg(frame, this.sampling, this.limits.maxBytes));
      }
    } finally {
      frame.close();
      this.rendering = false;
    }
  }

  private clearTrailing(): void {
    if (this.trailing !== null) {
      clearTimeout(this.trailing);
      this.trailing = null;
    }
  }
}
