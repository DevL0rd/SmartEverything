import type {
  PlannerChallenge,
  PlannerMathsDifficulty,
  PlannerMathsProblem,
} from '@smarteverything/domain';

export interface MathsEntry {
  readonly index: number;
  readonly typed: string;
  readonly wrong: boolean;
}

export type ChallengePlan =
  | { readonly kind: 'none' }
  | { readonly kind: 'maths'; readonly difficulty: PlannerMathsDifficulty; readonly count: number }
  | { readonly kind: 'qr'; readonly code: string }
  | { readonly kind: 'steps'; readonly steps: number }
  | { readonly kind: 'phone'; readonly what: 'qr' | 'steps' };

export const FIRST_ENTRY: MathsEntry = { index: 0, typed: '', wrong: false };

export function typeDigit(entry: MathsEntry, digit: string): MathsEntry {
  return { ...entry, typed: `${entry.typed}${digit}`, wrong: false };
}

export function eraseDigit(entry: MathsEntry): MathsEntry {
  return { ...entry, typed: entry.typed.slice(0, -1), wrong: false };
}

export function submitAnswer(
  entry: MathsEntry,
  problems: readonly PlannerMathsProblem[],
): MathsEntry {
  const problem = problems[entry.index];
  if (problem === undefined || entry.typed === '') return entry;
  if (Number(entry.typed) !== problem.answer) return { ...entry, typed: '', wrong: true };
  return { index: entry.index + 1, typed: '', wrong: false };
}

export function mathsSolved(entry: MathsEntry, problems: readonly PlannerMathsProblem[]): boolean {
  return entry.index >= problems.length;
}

export function qrRefusalOf(scanned: string, code: string): string | null {
  return scanned.trim() === code.trim() ? null : 'That is not the code for this alarm';
}

export function stepsProgressOf(counted: number, target: number): number {
  return Math.min(1, Math.max(0, counted) / target);
}

export function challengePlanOf(challenge: PlannerChallenge, onPhone: boolean): ChallengePlan {
  if (challenge.kind === 'qr' || challenge.kind === 'steps') {
    return onPhone ? challenge : { kind: 'phone', what: challenge.kind };
  }
  return challenge;
}
