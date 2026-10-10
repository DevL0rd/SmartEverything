import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Logger } from '@smarteverything/logging';

const log = new Logger('tool.ring-tone');

const OUTPUT = join(import.meta.dirname, '..', 'apps', 'app', 'assets', 'sounds', 'ring.wav');

const SAMPLE_RATE = 22_050;
const LENGTH_SECONDS = 3.2;
const FADE_OUT_SECONDS = 0.5;
const ATTACK_SECONDS = 0.006;
const DECAY_SECONDS = 0.4;
const PEAK = 0.6;
const HIGH_NOTE_HZ = 659.25;
const LOW_NOTE_HZ = 523.25;
const BYTES_PER_SAMPLE = 2;
const INT16_MAX = 32_767;

interface Note {
  readonly at: number;
  readonly hertz: number;
}

interface Partial {
  readonly ratio: number;
  readonly level: number;
}

const NOTES: readonly Note[] = [
  { at: 0, hertz: HIGH_NOTE_HZ },
  { at: 0.42, hertz: LOW_NOTE_HZ },
  { at: 1.2, hertz: HIGH_NOTE_HZ },
  { at: 1.62, hertz: LOW_NOTE_HZ },
];

const PARTIALS: readonly Partial[] = [
  { ratio: 1, level: 1 },
  { ratio: 2, level: 0.35 },
  { ratio: 3, level: 0.12 },
  { ratio: 4.2, level: 0.05 },
];

function noteAt(note: Note, seconds: number): number {
  const since = seconds - note.at;
  if (since < 0) {
    return 0;
  }
  const attack = Math.min(1, since / ATTACK_SECONDS);
  return (
    PARTIALS.reduce((sum, partial) => {
      const decay = Math.exp((-since * partial.ratio) / DECAY_SECONDS);
      return (
        sum + partial.level * decay * Math.sin(2 * Math.PI * note.hertz * partial.ratio * since)
      );
    }, 0) * attack
  );
}

function fadeAt(seconds: number): number {
  const left = LENGTH_SECONDS - seconds;
  return left >= FADE_OUT_SECONDS ? 1 : Math.max(0, left / FADE_OUT_SECONDS);
}

function synthesise(): Float64Array {
  const samples = new Float64Array(Math.round(SAMPLE_RATE * LENGTH_SECONDS));
  for (let index = 0; index < samples.length; index += 1) {
    const seconds = index / SAMPLE_RATE;
    const mixed = NOTES.reduce((sum, note) => sum + noteAt(note, seconds), 0);
    samples[index] = mixed * fadeAt(seconds);
  }
  return samples;
}

function normalised(samples: Float64Array): Int16Array {
  const loudest = samples.reduce((most, sample) => Math.max(most, Math.abs(sample)), 0);
  return Int16Array.from(samples, (sample) => Math.round((sample / loudest) * PEAK * INT16_MAX));
}

function wave(pcm: Int16Array): Buffer {
  const dataBytes = pcm.length * BYTES_PER_SAMPLE;
  const file = Buffer.alloc(44 + dataBytes);
  file.write('RIFF', 0, 'ascii');
  file.writeUInt32LE(36 + dataBytes, 4);
  file.write('WAVE', 8, 'ascii');
  file.write('fmt ', 12, 'ascii');
  file.writeUInt32LE(16, 16);
  file.writeUInt16LE(1, 20);
  file.writeUInt16LE(1, 22);
  file.writeUInt32LE(SAMPLE_RATE, 24);
  file.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  file.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  file.writeUInt16LE(16, 34);
  file.write('data', 36, 'ascii');
  file.writeUInt32LE(dataBytes, 40);
  pcm.forEach((sample, index) => {
    file.writeInt16LE(sample, 44 + index * BYTES_PER_SAMPLE);
  });
  return file;
}

const file = wave(normalised(synthesise()));
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, file);
log.info('ring_tone.written', { file: OUTPUT, bytes: file.length, seconds: LENGTH_SECONDS });
