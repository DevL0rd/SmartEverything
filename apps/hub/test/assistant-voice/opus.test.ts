import { describe, expect, it } from 'vitest';
import { opusCodec } from '../../src/assistant-voice/audio';
import { Opus, OpusCodecError } from '../../src/assistant-voice/opus';

function sine(samples: number, amplitude: number): Int16Array {
  return Int16Array.from({ length: samples }, (_, index) =>
    Math.round(amplitude * Math.sin((index * 2 * Math.PI * 440) / 48_000)),
  );
}

function rms(pcm: Int16Array): number {
  return Math.sqrt(pcm.reduce((sum, sample) => sum + sample * sample, 0) / pcm.length);
}

function roundTrip(frames: number): Int16Array {
  const codec = opusCodec();
  const frame = sine(960, 8000);
  let heard: Int16Array = new Int16Array(0);
  for (let count = 0; count < frames; count += 1) {
    heard = codec.decode(codec.encode(frame));
  }
  codec.free();
  return heard;
}

describe('Opus codec', () => {
  it('round-trips speech through the wasm module', () => {
    const heard = roundTrip(20);
    expect(heard).toHaveLength(960);
    expect(rms(heard)).toBeGreaterThan(rms(sine(960, 8000)) * 0.9);
  });

  it('keeps many live codecs from disturbing each other', () => {
    const codecs = Array.from({ length: 12 }, () => opusCodec());
    const frame = sine(960, 8000);
    let last: Int16Array = new Int16Array(0);
    for (let round = 0; round < 20; round += 1) {
      for (const codec of codecs) {
        last = codec.decode(codec.encode(frame));
      }
    }
    expect(rms(last)).toBeGreaterThan(rms(frame) * 0.9);
    codecs.forEach((codec) => {
      codec.free();
    });
  });

  it.each([1, 2])(
    'decodes 60 ms packets with %i channels beside a second live codec',
    (channels) => {
      const silk60ms = (11 << 3) | (channels === 2 ? 4 : 0);
      const packet = Uint8Array.from([
        silk60ms,
        ...Array.from({ length: 120 }, (_, index) => (index * 73 + 41) & 255),
      ]);
      const decoder = new Opus(48_000, channels);
      const neighbour = opusCodec();
      const frame = sine(960, 8000);
      for (let round = 0; round < 10; round += 1) {
        expect(decoder.decode(packet)).toHaveLength(2880 * channels);
        expect(rms(neighbour.decode(neighbour.encode(frame)))).toBeGreaterThan(0);
      }
      decoder.free();
      neighbour.free();
    },
  );

  it('decodes stereo packets to interleaved samples', () => {
    const codec = new Opus(48_000, 2);
    const packet = codec.encode(new Int16Array(1920), 960);
    expect(codec.decode(packet)).toHaveLength(1920);
    codec.free();
  });

  it('refuses a freed codec and an oversized packet', () => {
    const codec = new Opus(48_000, 1);
    expect(() => codec.decode(new Uint8Array(4000))).toThrow(OpusCodecError);
    codec.free();
    codec.free();
    expect(() => codec.decode(Uint8Array.of(0xf8, 0xff, 0xfe))).toThrow(OpusCodecError);
  });
});
