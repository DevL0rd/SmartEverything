import type { ButtonGesture } from '../types';

export interface Ripple {
  readonly key: string;
  readonly ms: number;
  readonly delay: number;
}

interface Timing {
  readonly ms: number;
  readonly delay: number;
}

const TIMINGS: Readonly<Record<ButtonGesture, readonly Timing[]>> = {
  single: [{ ms: 700, delay: 0 }],
  double: [
    { ms: 600, delay: 0 },
    { ms: 600, delay: 240 },
  ],
  long: [{ ms: 1200, delay: 0 }],
};

export interface RippleInput {
  readonly seen: string | null;
  readonly at: string | null;
  readonly gesture: ButtonGesture | null;
  readonly playing: boolean;
}

export function ripplesFor({ seen, at, gesture, playing }: RippleInput): readonly Ripple[] {
  if (!playing || gesture === null || at === null || at === seen) {
    return [];
  }
  return TIMINGS[gesture].map((timing) => ({ ...timing, key: `${at}-${String(timing.delay)}` }));
}
