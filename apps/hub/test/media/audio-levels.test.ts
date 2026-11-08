import { describe, expect, it } from 'vitest';
import { audioLevels, LevelPeaks } from '../../src/media/audio-levels';

function wav(samples: Int16Array, rate = 8000): Buffer {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function pcm(values: readonly number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => buffer.writeInt16LE(value, index * 2));
  return buffer;
}

describe('LevelPeaks', () => {
  it('takes the peak of each 50 ms window scaled to 0..255', () => {
    const peaks = new LevelPeaks();
    const quiet = Array.from({ length: 400 }, () => 0);
    const loud = Array.from({ length: 400 }, (_, index) => (index === 10 ? -32768 : 100));
    peaks.push(pcm([...quiet, ...loud]));
    expect(peaks.finish()).toEqual([0, 255]);
  });

  it('keeps a sample split across chunks and closes a partial last window', () => {
    const peaks = new LevelPeaks();
    const bytes = pcm([16384, 0, 8192]);
    peaks.push(bytes.subarray(0, 1));
    peaks.push(bytes.subarray(1));
    expect(peaks.finish()).toEqual([128]);
  });

  it('is empty for no audio', () => {
    expect(new LevelPeaks().finish()).toEqual([]);
  });
});

describe('audioLevels', () => {
  it('decodes a generated WAV into one level per 50 ms', async () => {
    const samples = new Int16Array(8000);
    samples.fill(16384, 4000);
    const levels = await audioLevels(wav(samples));
    expect(levels).toHaveLength(20);
    expect(levels.slice(0, 10).every((level) => level === 0)).toBe(true);
    expect(levels.slice(10).every((level) => Math.abs(level - 128) <= 2)).toBe(true);
  });

  it('rejects bytes that are not audio', async () => {
    await expect(audioLevels(Buffer.from('not audio at all'))).rejects.toThrow(/ffmpeg/);
  });
});
