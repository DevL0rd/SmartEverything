const SAMPLES_PER_MS = 16;
const GAP_MS = 1000;
const ANCHORS_KEPT = 32;

interface Anchor {
  readonly sample: number;
  at: number;
}

export class MediaClock {
  private readonly anchors: Anchor[] = [];
  private fed = 0;

  hear(samples: number, arrivedAt: number): void {
    const startedAt = arrivedAt - samples / SAMPLES_PER_MS;
    const last = this.anchors.at(-1);
    const early = last === undefined ? 0 : startedAt - this.wallAt(this.fed);
    if (last === undefined || Math.abs(early) > GAP_MS) {
      this.anchors.push({ sample: this.fed, at: startedAt });
      if (this.anchors.length > ANCHORS_KEPT) {
        this.anchors.shift();
      }
    } else if (early < 0) {
      last.at += early;
    }
    this.fed += samples;
  }

  wallAt(sample: number): number {
    const anchor = this.anchors.findLast((candidate) => candidate.sample <= sample);
    return anchor === undefined
      ? Number.NaN
      : anchor.at + (sample - anchor.sample) / SAMPLES_PER_MS;
  }
}
