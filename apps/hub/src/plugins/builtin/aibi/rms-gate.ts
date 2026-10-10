import { rms } from './pcm';

const FRAME_SAMPLES = 320;
const FRAMES_NEEDED = 4;
const PRE_ROLL_FRAMES = 12;

export class SpeechGate {
  private pending: Int16Array[] = [];
  private loudFrames = 0;
  private remainder = new Int16Array(0);
  private loud = false;

  constructor(
    private readonly threshold: number,
    private readonly framesNeeded = FRAMES_NEEDED,
    private readonly preRoll = PRE_ROLL_FRAMES,
  ) {}

  get heard(): boolean {
    return this.loud;
  }

  push(samples: Int16Array): Int16Array[] {
    if (this.loud) {
      return [samples];
    }
    this.pending.push(samples);
    if (!this.measure(samples)) {
      this.trim();
      return [];
    }
    const released = this.pending;
    this.pending = [];
    return released;
  }

  private measure(samples: Int16Array): boolean {
    const joined = new Int16Array(this.remainder.length + samples.length);
    joined.set(this.remainder);
    joined.set(samples, this.remainder.length);
    let offset = 0;
    for (; offset + FRAME_SAMPLES <= joined.length; offset += FRAME_SAMPLES) {
      const level = rms(joined.subarray(offset, offset + FRAME_SAMPLES));
      this.loudFrames = level >= this.threshold ? this.loudFrames + 1 : 0;
      if (this.loudFrames >= this.framesNeeded) {
        this.loud = true;
      }
    }
    this.remainder = joined.slice(offset);
    return this.loud;
  }

  private trim(): void {
    let samples = this.pending.reduce((total, chunk) => total + chunk.length, 0);
    for (;;) {
      const first = this.pending[0];
      if (
        this.pending.length <= 1 ||
        first === undefined ||
        samples - first.length < this.preRoll * FRAME_SAMPLES
      ) {
        return;
      }
      samples -= first.length;
      this.pending.shift();
    }
  }
}
