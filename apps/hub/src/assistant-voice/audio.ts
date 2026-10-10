import { TALK_FRAME_MS, TALK_SAMPLE_RATE } from '@smarteverything/domain';
import { Opus } from './opus';

export const SPEECH_RATE = 16_000;
export const LIVE_RATE = 24_000;

const FRAME_SAMPLES = (TALK_SAMPLE_RATE * TALK_FRAME_MS) / 1000;
const DOWNSAMPLE = TALK_SAMPLE_RATE / SPEECH_RATE;

export interface OpusCodec {
  readonly decode: (packet: Uint8Array) => Int16Array;
  readonly encode: (pcm: Int16Array) => Buffer;
  readonly free: () => void;
}

export function opusCodec(): OpusCodec {
  let codec = new Opus(TALK_SAMPLE_RATE, 1);
  const live = (): Opus => {
    if (codec.stale) {
      codec = new Opus(TALK_SAMPLE_RATE, 1);
    }
    return codec;
  };
  return {
    decode: (packet) => live().decode(packet),
    encode: (pcm) => live().encode(pcm, FRAME_SAMPLES),
    free: (): void => {
      codec.free();
    },
  };
}

export function concat(chunks: readonly Int16Array[]): Int16Array {
  const out = new Int16Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function toSpeech(mono: Int16Array): Int16Array {
  const out = new Int16Array(Math.floor(mono.length / DOWNSAMPLE));
  for (let index = 0; index < out.length; index++) {
    let sum = 0;
    for (let step = 0; step < DOWNSAMPLE; step++) {
      sum += mono[index * DOWNSAMPLE + step] ?? 0;
    }
    out[index] = Math.round(sum / DOWNSAMPLE);
  }
  return out;
}

export function liveToDevice(pcm: Int16Array, previous: number): Int16Array {
  const out = new Int16Array(pcm.length * 2);
  let last = previous;
  pcm.forEach((sample, index) => {
    out[index * 2] = Math.round((last + sample) / 2);
    out[index * 2 + 1] = sample;
    last = sample;
  });
  return out;
}

export function opusFrames(pcm: Int16Array, codec: OpusCodec): Buffer[] {
  const frames: Buffer[] = [];
  for (let offset = 0; offset < pcm.length; offset += FRAME_SAMPLES) {
    const frame = new Int16Array(FRAME_SAMPLES);
    frame.set(pcm.subarray(offset, offset + FRAME_SAMPLES));
    frames.push(codec.encode(frame));
  }
  return frames;
}

export class OpusFramer {
  private pending = new Int16Array(0);
  private last = 0;

  constructor(private readonly codec: OpusCodec) {}

  live(pcm: Int16Array): Buffer[] {
    const device = liveToDevice(pcm, this.last);
    this.last = pcm.at(-1) ?? this.last;
    const joined = concat([this.pending, device]);
    const whole = joined.length - (joined.length % FRAME_SAMPLES);
    this.pending = joined.slice(whole);
    return whole > 0 ? opusFrames(joined.subarray(0, whole), this.codec) : [];
  }

  flush(): Buffer[] {
    const rest = this.pending;
    this.reset();
    return rest.length > 0 ? opusFrames(rest, this.codec) : [];
  }

  reset(): void {
    this.pending = new Int16Array(0);
    this.last = 0;
  }
}

export function secondsOf(frames: number): number {
  return (frames * TALK_FRAME_MS) / 1000;
}
