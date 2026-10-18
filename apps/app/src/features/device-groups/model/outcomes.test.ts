import { describe, expect, it } from 'vitest';
import type { MemberOutcome } from '@smarteverything/domain';
import {
  hasIssues,
  outcomeMarks,
  resultHeadline,
  resultLines,
  retryLabel,
  shownOutcomes,
  unreachableNote,
  unresolvedOutcomes,
} from './outcomes';

const NAMES: Readonly<Record<string, string>> = { a: 'Hall', b: 'Desk', c: 'Porch', d: 'Lamp' };
const nameOf = (id: string): string => NAMES[id] ?? id;

const ALL: readonly MemberOutcome[] = [
  { status: 'changed', deviceId: 'a' },
  { status: 'failed', deviceId: 'b', reason: 'no_response' },
  { status: 'skipped', deviceId: 'c', reason: 'offline' },
  { status: 'skipped', deviceId: 'd', reason: 'unsupported' },
  { status: 'pending', deviceId: 'e' },
];

describe('shownOutcomes', () => {
  it('drops changed and unsupported members and keeps failures, offline and waiting', () => {
    expect(shownOutcomes(ALL).map((outcome) => outcome.deviceId)).toStrictEqual(['b', 'c', 'e']);
  });
});

describe('hasIssues', () => {
  it('stays quiet while members are only waiting', () => {
    expect(hasIssues([{ status: 'pending', deviceId: 'a' }])).toBe(false);
    expect(hasIssues(shownOutcomes(ALL))).toBe(true);
  });
});

describe('outcomeMarks', () => {
  it('marks failed and waiting members only', () => {
    expect([...outcomeMarks(ALL)]).toStrictEqual([
      ['b', 'failed'],
      ['e', 'pending'],
    ]);
  });
});

describe('result text', () => {
  const shown = shownOutcomes(ALL);

  it('counts what did not change and what is still waiting', () => {
    expect(resultHeadline(shown, 'light')).toBe("2 lights didn't change · 1 still waiting");
  });

  it('lists one line per settled member', () => {
    expect(resultLines(shown, nameOf)).toStrictEqual([
      { deviceId: 'b', text: "Desk: Didn't respond" },
      { deviceId: 'c', text: 'Porch: Offline' },
    ]);
  });

  it('offers a retry only for lights that failed', () => {
    expect(retryLabel(shown, nameOf, 'light')).toBe('Retry Desk');
    expect(
      retryLabel(
        [
          { status: 'failed', deviceId: 'a', reason: 'refused' },
          { status: 'failed', deviceId: 'b', reason: 'error' },
        ],
        nameOf,
        'light',
      ),
    ).toBe('Retry 2 lights');
    expect(
      retryLabel([{ status: 'skipped', deviceId: 'c', reason: 'offline' }], nameOf, 'light'),
    ).toBeNull();
  });

  it('says why offline lights are not retried', () => {
    expect(unreachableNote(shown, nameOf)).toBe("Porch is offline, so it can't be retried.");
    expect(
      unreachableNote(
        [
          { status: 'skipped', deviceId: 'a', reason: 'offline' },
          { status: 'skipped', deviceId: 'c', reason: 'offline' },
        ],
        nameOf,
      ),
    ).toBe("Hall, Porch are offline, so they can't be retried.");
    expect(unreachableNote([], nameOf)).toBeNull();
  });
});

describe('unresolvedOutcomes', () => {
  const shown = shownOutcomes(ALL);

  it('keeps every outcome while the offline member is still offline', () => {
    expect(unresolvedOutcomes(shown, { b: 'on', c: 'offline' })).toBe(shown);
  });

  it('drops the offline note of a member that has come back', () => {
    const kept = unresolvedOutcomes(shown, { b: 'on', c: 'off' });
    expect(kept.map((outcome) => outcome.deviceId)).toStrictEqual(['b', 'e']);
  });

  it('keeps failures and waiting members whatever their power', () => {
    const kept = unresolvedOutcomes(shown, { b: 'off', c: 'on', e: 'on' });
    expect(kept.some((outcome) => outcome.status === 'failed')).toBe(true);
    expect(kept.some((outcome) => outcome.status === 'pending')).toBe(true);
  });
});
