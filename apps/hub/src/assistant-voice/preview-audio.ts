import { VOICE_PREVIEW_RATE } from '@smarteverything/domain';

const WAV_HEADER_BYTES = 44;
const PCM_BYTES_PER_SAMPLE = 2;

export function previewWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write('RIFF', 0);
  header.writeUInt32LE(pcm.length + WAV_HEADER_BYTES - 8, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(VOICE_PREVIEW_RATE, 24);
  header.writeUInt32LE(VOICE_PREVIEW_RATE * PCM_BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(PCM_BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
