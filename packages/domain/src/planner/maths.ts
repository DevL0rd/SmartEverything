import type { PlannerChallenge } from './alarms';
import type { PLANNER_RING_KINDS } from './rings';

export type PlannerMathsDifficulty = Extract<
  PlannerChallenge,
  { readonly kind: 'maths' }
>['difficulty'];

export interface PlannerMathsProblem {
  readonly text: string;
  readonly answer: number;
}

type Random = () => number;

const HASH_START = 2_166_136_261;
const HASH_PRIME = 16_777_619;
const UINT = 4_294_967_296;

function hashOf(text: string): number {
  let hash = HASH_START;
  for (const char of text) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), HASH_PRIME) >>> 0;
  }
  return hash;
}

function randomFrom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT;
  };
}

function between(random: Random, low: number, high: number): number {
  return low + Math.floor(random() * (high - low + 1));
}

function easy(random: Random): PlannerMathsProblem {
  const first = between(random, 2, 9);
  const second = between(random, 11, 49);
  return { text: `${String(first)} + ${String(second)}`, answer: first + second };
}

function medium(random: Random): PlannerMathsProblem {
  const first = between(random, 21, 89);
  const second = between(random, 12, 79);
  if (random() < 0.5 || second >= first) {
    return { text: `${String(first)} + ${String(second)}`, answer: first + second };
  }
  return { text: `${String(first)} − ${String(second)}`, answer: first - second };
}

function hard(random: Random): PlannerMathsProblem {
  const first = between(random, 3, 12);
  const second = between(random, 11, 19);
  const third = between(random, 11, 59);
  return {
    text: `${String(first)} × ${String(second)} + ${String(third)}`,
    answer: first * second + third,
  };
}

const MAKERS: Readonly<Record<PlannerMathsDifficulty, (random: Random) => PlannerMathsProblem>> = {
  easy,
  medium,
  hard,
};

export function plannerMathsSeedOf(
  kind: (typeof PLANNER_RING_KINDS)[number],
  refId: string,
  day: string,
): string {
  return `${kind}:${refId}:${day}`;
}

export function plannerMathsProblemsOf(
  seed: string,
  difficulty: PlannerMathsDifficulty,
  count: number,
): readonly PlannerMathsProblem[] {
  const random = randomFrom(hashOf(seed));
  const make = MAKERS[difficulty];
  return Array.from({ length: count }, () => make(random));
}
