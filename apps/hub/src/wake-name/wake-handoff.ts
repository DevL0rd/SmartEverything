import { levelOf } from '@smarteverything/domain';
import { concat } from '../assistant-voice/audio';

export const REPLAY_MS = 3000;
export const LOOKBACK_MS = 15_000;
export const HANDOFF_LIMIT_MS = 15_000;
const SAMPLES_PER_MS = 16;
const FULL_SCALE = 32_768;
const FLOOR_DBFS = -120;

export function dbfsOf(pcm: Int16Array): number {
  return Math.max(FLOOR_DBFS, 20 * Math.log10(levelOf(pcm, FULL_SCALE)));
}

function tailOf(chunks: readonly Int16Array[], wanted: number): Int16Array[] {
  const tail: Int16Array[] = [];
  let count = 0;
  for (let index = chunks.length - 1; index >= 0 && count < wanted; index--) {
    const chunk = chunks[index];
    if (chunk === undefined) {
      break;
    }
    const part =
      chunk.length > wanted - count ? chunk.subarray(chunk.length - (wanted - count)) : chunk;
    tail.push(part);
    count += part.length;
  }
  return tail;
}

interface Chunk {
  readonly from: number;
  readonly pcm: Int16Array;
}

interface Sentence {
  readonly from: number;
  to: number | null;
}

function joined(chunks: readonly Chunk[], from: number): Int16Array {
  const first = chunks[0]?.from ?? from;
  return concat(chunks.map((chunk) => chunk.pcm)).subarray(Math.max(0, from - first));
}

export class WakeHandoff {
  private recent: Chunk[] = [];
  private recentSamples = 0;
  private heard = 0;
  private sentences: Sentence[] = [];
  private held: Chunk[] | null = null;
  private heldMs = 0;

  keep(pcm: Int16Array): void {
    const chunk = { from: this.heard, pcm };
    this.heard += pcm.length;
    if (this.held === null) {
      this.remember(chunk);
      return;
    }
    this.held.push(chunk);
    this.heldMs += pcm.length / SAMPLES_PER_MS;
    if (this.heldMs > HANDOFF_LIMIT_MS) {
      this.held = null;
    }
  }

  sentenceBegan(from: number): void {
    this.sentences.push({ from, to: null });
    const horizon = this.heard - LOOKBACK_MS * SAMPLES_PER_MS;
    this.sentences = this.sentences.filter((sentence) => (sentence.to ?? Infinity) >= horizon);
  }

  sentenceEnded(): void {
    const last = this.sentences.at(-1);
    if (last !== undefined) {
      last.to = this.heard;
    }
  }

  level(ms: number): number {
    const tail = tailOf(
      (this.held ?? this.recent).map((chunk) => chunk.pcm),
      ms * SAMPLES_PER_MS,
    );
    return dbfsOf(concat(tail));
  }

  begin(): () => Int16Array {
    const wokeAt = this.heard;
    const held = this.recent;
    this.recent = [];
    this.recentSamples = 0;
    this.held = held;
    this.heldMs = 0;
    return (): Int16Array => {
      if (this.held !== held) {
        return new Int16Array(0);
      }
      this.held = null;
      return joined(held, this.startOf(wokeAt));
    };
  }

  private startOf(wokeAt: number): number {
    const sentence = this.sentences.findLast((one) => one.from <= wokeAt);
    const open = sentence !== undefined && (sentence.to === null || sentence.to >= wokeAt);
    return open ? sentence.from : wokeAt - REPLAY_MS * SAMPLES_PER_MS;
  }

  private remember(chunk: Chunk): void {
    this.recent.push(chunk);
    this.recentSamples += chunk.pcm.length;
    while (this.recentSamples - (this.recent[0]?.pcm.length ?? 0) >= LOOKBACK_MS * SAMPLES_PER_MS) {
      this.recentSamples -= this.recent.shift()?.pcm.length ?? 0;
    }
  }
}
