import type { PairedAndroidBuild } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { awaitingFallbacks, fallbackLine } from './android-fallbacks';

const UPDATE = '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c11';

function build(
  clientId: string,
  outcome: 'fell_back' | 'kept_built_in' | null,
): PairedAndroidBuild {
  return {
    clientId,
    observation: {
      applicationId: 'com.example.app',
      versionCode: '200',
      runtimeVersion: 'runtime-a',
      channel: 'release',
      currentUpdateId: null,
      observedAt: '2026-11-14T10:00:00.000Z',
      lastOutcome:
        outcome === null
          ? null
          : { updateId: UPDATE, outcome, reason: null, recordedAt: '2026-11-14T10:01:00.000Z' },
    },
  };
}

describe('android updates awaiting a decision', () => {
  it('lists only phones whose last report is a fall back', () => {
    const waiting = awaitingFallbacks([
      build('a', 'fell_back'),
      build('b', 'kept_built_in'),
      build('c', null),
    ]);
    expect(waiting).toEqual([
      { clientId: 'a', updateId: UPDATE, recordedAt: '2026-11-14T10:01:00.000Z' },
    ]);
    const [first] = waiting;
    if (first === undefined) throw new Error('missing fall back');
    expect(fallbackLine(first)).toContain(`Update ${UPDATE} could not start`);
    expect(fallbackLine(first)).toContain('Stay on the built-in version');
  });
});
