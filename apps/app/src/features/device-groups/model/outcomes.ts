import {
  retryable,
  targetResultHeadline,
  memberOutcomeLine,
  type MemberOutcome,
} from '@smarteverything/domain';
import { plural } from '../../../format/text';
import type { MemberNoun } from '../group-summary';
import type { MemberPower } from '../use-target-state';
import type { MemberMark } from './stage';

export function shownOutcomes(outcomes: readonly MemberOutcome[]): readonly MemberOutcome[] {
  return outcomes.filter((outcome) => {
    if (outcome.status === 'changed') return false;
    return (
      outcome.status !== 'skipped' || outcome.reason === 'offline' || outcome.reason === 'removed'
    );
  });
}

export function unresolvedOutcomes(
  outcomes: readonly MemberOutcome[],
  powers: Readonly<Record<string, MemberPower>>,
): readonly MemberOutcome[] {
  const kept = outcomes.filter(
    (outcome) =>
      !(
        outcome.status === 'skipped' &&
        outcome.reason === 'offline' &&
        powers[outcome.deviceId] !== 'offline'
      ),
  );
  return kept.length === outcomes.length ? outcomes : kept;
}

export function hasIssues(outcomes: readonly MemberOutcome[]): boolean {
  return outcomes.some((outcome) => outcome.status !== 'pending');
}

export function outcomeMarks(outcomes: readonly MemberOutcome[]): ReadonlyMap<string, MemberMark> {
  const marks = new Map<string, MemberMark>();
  for (const outcome of outcomes)
    if (outcome.status === 'failed' || outcome.status === 'pending')
      marks.set(outcome.deviceId, outcome.status);
  return marks;
}

export function resultHeadline(
  outcomes: readonly MemberOutcome[],
  noun: MemberNoun,
): string | null {
  return targetResultHeadline(outcomes, noun);
}

export interface ResultEntry {
  readonly deviceId: string;
  readonly text: string;
}

export function resultLines(
  outcomes: readonly MemberOutcome[],
  nameOf: (deviceId: string) => string,
): readonly ResultEntry[] {
  return outcomes
    .filter((outcome) => outcome.status !== 'pending')
    .map((outcome) => ({
      deviceId: outcome.deviceId,
      text: memberOutcomeLine(nameOf(outcome.deviceId), outcome),
    }));
}

export function retryLabel(
  outcomes: readonly MemberOutcome[],
  nameOf: (deviceId: string) => string,
  noun: MemberNoun,
): string | null {
  const ids = retryable(outcomes);
  const first = ids[0];
  if (first === undefined) return null;
  return ids.length === 1 ? `Retry ${nameOf(first)}` : `Retry ${plural(ids.length, noun)}`;
}

export function unreachableNote(
  outcomes: readonly MemberOutcome[],
  nameOf: (deviceId: string) => string,
): string | null {
  const names = outcomes.flatMap((outcome) =>
    outcome.status === 'skipped' && outcome.reason === 'offline' ? [nameOf(outcome.deviceId)] : [],
  );
  if (names.length === 0) return null;
  return names.length === 1
    ? `${names[0] ?? ''} is offline, so it can't be retried.`
    : `${names.join(', ')} are offline, so they can't be retried.`;
}
