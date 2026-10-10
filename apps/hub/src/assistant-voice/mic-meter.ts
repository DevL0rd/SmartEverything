import { EchoProbe, levelDb } from './echo-probe';
import type { Measure } from './turn-timing';

const MIC_RATE = 16_000;
const PLAYBACK_RATE = 24_000;
const LIVE_CHUNK_SAMPLES = 800;
const STALL_MS = 100;
const VOICE_OVER_FLOOR = 4;
const FLOOR_RISE = 0.001;
const ECHO_SETTLE_MS = 3000;

interface DroppedRun {
  ms: number;
  sumSquares: number;
  samples: number;
  peak: number;
}

function energyOf(pcm: Int16Array): { sumSquares: number; peak: number } {
  let sumSquares = 0;
  let peak = 0;
  for (const sample of pcm) {
    sumSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return { sumSquares, peak };
}

export class MicMeter {
  private readonly probe: EchoProbe;
  private floor = Number.POSITIVE_INFINITY;
  private lastChunkAt: number | null = null;
  private lastVoicedAt: number | null = null;
  private run: DroppedRun | null = null;
  private forwardedMs = 0;
  private droppedMs = 0;
  private stalls = 0;
  private longestStallMs = 0;

  constructor(
    private readonly now: () => number,
    private readonly measure: Measure,
  ) {
    this.probe = new EchoProbe(now, PLAYBACK_RATE);
  }

  get sinceVoiceMs(): number | null {
    return this.lastVoicedAt === null ? null : this.now() - this.lastVoicedAt;
  }

  played(pcm: Int16Array): void {
    this.probe.play(pcm);
  }

  heard(pcm: Int16Array, dropped: boolean): void {
    const ms = (pcm.length * 1000) / MIC_RATE;
    if (pcm.length > LIVE_CHUNK_SAMPLES) {
      this.forwardedMs += ms;
      return;
    }
    const { sumSquares, peak } = energyOf(pcm);
    this.watchArrival(ms);
    this.probe.listen(pcm, MIC_RATE);
    if (dropped) {
      this.drop(ms, sumSquares, pcm.length, peak);
    } else {
      this.reopen();
      this.forwardedMs += ms;
      this.watchVoice(Math.sqrt(sumSquares / Math.max(pcm.length, 1)));
    }
  }

  summarize(): void {
    this.reopen();
    this.measure('voice.mic_summarized', {
      forwardedMs: Math.round(this.forwardedMs),
      droppedMs: Math.round(this.droppedMs),
      stalls: this.stalls,
      longestStallMs: this.longestStallMs,
    });
  }

  private watchArrival(ms: number): void {
    const at = this.now();
    if (this.lastChunkAt !== null) {
      const gap = at - this.lastChunkAt - ms;
      if (gap > STALL_MS) {
        this.stalls += 1;
        this.longestStallMs = Math.max(this.longestStallMs, Math.round(gap));
      }
    }
    this.lastChunkAt = at;
  }

  private watchVoice(level: number): void {
    const rms = Math.max(level, 1);
    this.floor = rms < this.floor ? rms : this.floor + (rms - this.floor) * FLOOR_RISE;
    if (rms > this.floor * VOICE_OVER_FLOOR) {
      this.lastVoicedAt = this.now();
    }
  }

  private drop(ms: number, sumSquares: number, samples: number, peak: number): void {
    this.droppedMs += ms;
    const run = this.run ?? { ms: 0, sumSquares: 0, samples: 0, peak: 0 };
    run.ms += ms;
    run.sumSquares += sumSquares;
    run.samples += samples;
    run.peak = Math.max(run.peak, peak);
    this.run = run;
  }

  private reopen(): void {
    const run = this.run;
    if (run === null) {
      if (this.probe.quietFor(ECHO_SETTLE_MS)) {
        this.reportEcho();
      }
      return;
    }
    this.run = null;
    this.measure('voice.mic_gated', {
      droppedMs: Math.round(run.ms),
      rmsDb: Math.round(levelDb(Math.sqrt(run.sumSquares / Math.max(run.samples, 1)))),
      peakDb: Math.round(levelDb(run.peak)),
    });
    this.reportEcho();
  }

  private reportEcho(): void {
    const echo = this.probe.estimate();
    if (echo !== null) {
      this.measure('voice.echo_measured', {
        lagMs: echo.lagMs,
        correlation: Math.round(echo.correlation * 100) / 100,
        echoDb: Math.round(echo.echoDb),
        ...(Number.isFinite(this.floor) ? { floorDb: Math.round(levelDb(this.floor)) } : {}),
      });
    }
  }
}
