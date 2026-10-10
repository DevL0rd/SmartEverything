import { Mp3Encoder } from '@breezystack/lamejs';

export const GEMINI_RATE = 24_000;
const MP3_RATE = 32_000;
const MP3_KBPS = 64;

const MILLISECONDS = 1000;

class Resampler {
  private previous = 0;
  private position = 0;
  private readonly step: number;

  constructor(from: number, to: number) {
    this.step = from / to;
  }

  push(input: Int16Array): Int16Array {
    if (input.length === 0) {
      return input;
    }
    const source = new Int16Array(input.length + 1);
    source[0] = this.previous;
    source.set(input, 1);
    const output: number[] = [];
    let at = this.position;
    while (at < source.length - 1) {
      const index = Math.floor(at);
      const fraction = at - index;
      const from = source[index] ?? 0;
      const to = source[index + 1] ?? 0;
      output.push(Math.round(from * (1 - fraction) + to * fraction));
      at += this.step;
    }
    this.position = at - (source.length - 1);
    this.previous = input[input.length - 1] ?? 0;
    return Int16Array.from(output);
  }
}

export class Mp3Stream {
  private readonly encoder = new Mp3Encoder(1, MP3_RATE, MP3_KBPS);
  private readonly resampler = new Resampler(GEMINI_RATE, MP3_RATE);

  encode(pcm: Int16Array): Buffer {
    return Buffer.from(this.encoder.encodeBuffer(this.resampler.push(pcm)));
  }

  finish(): Buffer {
    return Buffer.from(this.encoder.flush());
  }
}

export function silence(milliseconds: number): Buffer {
  const stream = new Mp3Stream();
  const samples = new Int16Array(Math.round((GEMINI_RATE * milliseconds) / MILLISECONDS));
  return Buffer.concat([stream.encode(samples), stream.finish()]);
}
