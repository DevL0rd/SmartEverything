const SAMPLES_PER_MS = 48;

export class OpusPacketError extends Error {
  override readonly name = 'OpusPacketError';
}

function frameMs(config: number): number {
  if (config < 12) {
    const step = config % 4;
    return step === 3 ? 60 : 10 * 2 ** step;
  }
  if (config < 16) {
    return 10 * 2 ** (config % 2);
  }
  return 2.5 * 2 ** (config % 4);
}

function framesIn(packet: Uint8Array, code: number): number {
  if (code === 0) {
    return 1;
  }
  if (code === 1 || code === 2) {
    return 2;
  }
  const count = packet[1];
  if (count === undefined) {
    throw new OpusPacketError('An Opus packet with code 3 carries no frame count.');
  }
  return count & 0x3f;
}

export function samplesOf(packet: Uint8Array): number {
  const toc = packet[0];
  if (toc === undefined) {
    throw new OpusPacketError('An Opus packet cannot be empty.');
  }
  return framesIn(packet, toc & 0x03) * frameMs(toc >> 3) * SAMPLES_PER_MS;
}
