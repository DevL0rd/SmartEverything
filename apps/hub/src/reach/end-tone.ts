import { TALK_END_TONE, TALK_SAMPLE_RATE, TALK_START_TONE } from '@smarteverything/domain';
import { concat, opusCodec, opusFrames } from '../assistant-voice/audio';

const PEAK = 0.12 * 32_767;
const FLOOR = 0.001 / 0.12;

function note(frequency: number, seconds: number): Int16Array {
  const count = Math.round(seconds * TALK_SAMPLE_RATE);
  return Int16Array.from({ length: count }, (_, index) =>
    Math.round(
      PEAK *
        FLOOR ** (index / count) *
        Math.sin((2 * Math.PI * frequency * index) / TALK_SAMPLE_RATE),
    ),
  );
}

type Notes = readonly (readonly [number, number])[];

const encoded = new Map<Notes, readonly Uint8Array[]>();

function tonePackets(notes: Notes): readonly Uint8Array[] {
  const known = encoded.get(notes);
  if (known !== undefined) {
    return known;
  }
  const codec = opusCodec();
  const packets = opusFrames(
    concat(notes.map(([frequency, seconds]) => note(frequency, seconds))),
    codec,
  );
  codec.free();
  encoded.set(notes, packets);
  return packets;
}

export function endTonePackets(): readonly Uint8Array[] {
  return tonePackets(TALK_END_TONE);
}

export function startTonePackets(): readonly Uint8Array[] {
  return tonePackets(TALK_START_TONE);
}
