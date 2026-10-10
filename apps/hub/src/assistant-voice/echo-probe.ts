const BIN_MS = 40;
const MAX_LAG_MS = 4000;
const MIN_BINS = 10;
const MAX_LAG_BINS = MAX_LAG_MS / BIN_MS;
const KEPT_BINS = 1500;

export interface EchoEstimate {
  readonly lagMs: number;
  readonly correlation: number;
  readonly echoDb: number;
}

interface Energy {
  sumSquares: number;
  samples: number;
}

export function levelDb(rms: number): number {
  return 20 * Math.log10(Math.max(rms, 1) / 32768);
}

function binOf(ms: number): number {
  return Math.floor(ms / BIN_MS);
}

function rmsOf(energy: Energy | undefined): number | null {
  return energy === undefined || energy.samples === 0
    ? null
    : Math.sqrt(energy.sumSquares / energy.samples);
}

function correlationOf(pairs: readonly (readonly [number, number])[]): number {
  const n = pairs.length;
  const meanA = pairs.reduce((sum, [a]) => sum + a, 0) / n;
  const meanB = pairs.reduce((sum, [, b]) => sum + b, 0) / n;
  let cross = 0;
  let varA = 0;
  let varB = 0;
  for (const [a, b] of pairs) {
    cross += (a - meanA) * (b - meanB);
    varA += (a - meanA) ** 2;
    varB += (b - meanB) ** 2;
  }
  return varA === 0 || varB === 0 ? 0 : cross / Math.sqrt(varA * varB);
}

export class EchoProbe {
  private readonly played = new Map<number, number>();
  private readonly heard = new Map<number, Energy>();
  private playedUntil = 0;

  constructor(
    private readonly now: () => number,
    private readonly rate: number,
  ) {}

  play(pcm: Int16Array): void {
    const binSamples = (this.rate * BIN_MS) / 1000;
    const start = Math.max(this.now(), this.playedUntil);
    for (let offset = 0; offset < pcm.length; offset += binSamples) {
      const slice = pcm.subarray(offset, offset + binSamples);
      const energy = slice.reduce((sum, sample) => sum + sample * sample, 0);
      const bin = binOf(start + (offset * 1000) / this.rate);
      this.played.set(bin, (this.played.get(bin) ?? 0) + energy / binSamples);
    }
    this.playedUntil = start + (pcm.length * 1000) / this.rate;
    this.prune();
  }

  listen(pcm: Int16Array, rate: number): void {
    const bin = binOf(this.now() - (pcm.length * 1000) / rate);
    const energy = this.heard.get(bin) ?? { sumSquares: 0, samples: 0 };
    energy.sumSquares += pcm.reduce((sum, sample) => sum + sample * sample, 0);
    energy.samples += pcm.length;
    this.heard.set(bin, energy);
    this.prune();
  }

  quietFor(ms: number): boolean {
    return this.played.size > 0 && this.now() - this.playedUntil >= ms;
  }

  estimate(): EchoEstimate | null {
    const bins = [...this.played.keys()].sort((a, b) => a - b);
    const newest = binOf(this.now());
    const best = this.bestLag(bins, newest);
    this.played.clear();
    return best;
  }

  private bestLag(bins: readonly number[], newest: number): EchoEstimate | null {
    if (bins.length < MIN_BINS) {
      return null;
    }
    let best: EchoEstimate | null = null;
    for (let lag = 0; lag <= MAX_LAG_BINS; lag++) {
      const pairs = this.pairsAt(bins, lag, newest);
      if (pairs.length < MIN_BINS) {
        continue;
      }
      const correlation = correlationOf(pairs);
      if (best === null || correlation > best.correlation) {
        const echo = pairs.reduce((sum, [, heard]) => sum + heard, 0) / pairs.length;
        best = { lagMs: lag * BIN_MS, correlation, echoDb: levelDb(echo) };
      }
    }
    return best;
  }

  private pairsAt(
    bins: readonly number[],
    lag: number,
    newest: number,
  ): (readonly [number, number])[] {
    const pairs: (readonly [number, number])[] = [];
    for (const bin of bins) {
      const heard = rmsOf(this.heard.get(bin + lag));
      const played = this.played.get(bin);
      if (heard !== null && played !== undefined && bin + lag <= newest) {
        pairs.push([Math.sqrt(played), heard]);
      }
    }
    return pairs;
  }

  private prune(): void {
    if (this.heard.size + this.played.size < 2 * KEPT_BINS) {
      return;
    }
    const oldest = binOf(this.now()) - KEPT_BINS;
    for (const bins of [this.heard, this.played]) {
      [...bins.keys()]
        .filter((bin) => bin < oldest)
        .forEach((bin) => {
          bins.delete(bin);
        });
    }
  }
}
