import { processColor } from 'react-native';
import { isNative } from './platform';

export class UnreadableColourError extends Error {
  override readonly name = 'UnreadableColourError';

  constructor(readonly colour: string) {
    super(`The colour ${colour} is not a colour React Native can read.`);
  }
}

const PERCENT = 100;

export function faded(colour: string, alpha: number): string {
  if (!isNative()) {
    return `color-mix(in srgb, ${colour} ${String(alpha * PERCENT)}%, transparent)`;
  }
  const packed = processColor(colour);
  if (typeof packed !== 'number') {
    throw new UnreadableColourError(colour);
  }
  const channel = (shift: number): number => (packed >>> shift) & 0xff;
  const opacity = (channel(24) / 0xff) * alpha;
  return `rgba(${String(channel(16))}, ${String(channel(8))}, ${String(channel(0))}, ${String(opacity)})`;
}
