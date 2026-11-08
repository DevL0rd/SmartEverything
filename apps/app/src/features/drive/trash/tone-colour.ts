import { processColor } from 'react-native';
import { useColourResolver } from '../../../design/colour';
import { isNative } from '../../../design/platform';
import type { PersonTone } from './deleted-by';

const PERCENT = 100;

export class UnmixableColourError extends Error {
  override readonly name = 'UnmixableColourError';

  constructor(readonly colour: string) {
    super(`The colour ${colour} cannot be mixed.`);
  }
}

function packedOf(colour: string): number {
  const packed = processColor(colour);
  if (typeof packed !== 'number') throw new UnmixableColourError(colour);
  return packed;
}

function channelMix(first: number, second: number, shift: number, share: number): number {
  const from = (first >>> shift) & 0xff;
  const to = (second >>> shift) & 0xff;
  return Math.round(from * share + to * (1 - share));
}

export function mixColours(colour: string, toward: string, share: number): string {
  if (!isNative()) {
    return `color-mix(in srgb, ${colour} ${String(Math.round(share * PERCENT))}%, ${toward})`;
  }
  const first = packedOf(colour);
  const second = packedOf(toward);
  const [red, green, blue] = [16, 8, 0].map((shift) => channelMix(first, second, shift, share));
  return `rgb(${String(red)}, ${String(green)}, ${String(blue)})`;
}

export function useToneColour(): (tone: PersonTone) => string {
  const resolve = useColourResolver();
  return (tone) =>
    tone.toward === null
      ? resolve(tone.colour)
      : mixColours(resolve(tone.colour), resolve(tone.toward), tone.share);
}
