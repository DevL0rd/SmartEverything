import { describe, expect, it } from 'vitest';
import type { AiHarnessFailure } from '@smarteverything/domain';
import { PLAIN_ERROR } from '../model/failure-copy';
import { harnessFailureCopy, type HarnessFailureNames } from './harness-failure';

const names: HarnessFailureNames = {
  machine: 'Workstation',
  route: 'Claude subscription · Workstation',
  folder: '~/repo',
  reset: (at) => `at ${at}`,
};

const failure = (
  code: AiHarnessFailure['code'],
  retry_at: string | null = null,
): AiHarnessFailure => ({ code, message: 'Server words', retry_at });

describe('harnessFailureCopy', () => {
  it('names the machine when the runtime is down and points to the computer', () => {
    expect(harnessFailureCopy(failure('runtime_unavailable'), names)).toEqual({
      title: 'The SmartEverything runtime on Workstation isn’t running',
      body: null,
      action: 'open_computer',
    });
  });

  it('treats route and subscription outages alike and offers another model', () => {
    for (const code of ['route_unavailable', 'subscription_unavailable'] as const) {
      const copy = harnessFailureCopy(failure(code), names);
      expect(copy.title).toBe('Claude subscription · Workstation isn’t available on Workstation');
      expect(copy.action).toBe('choose_model');
    }
  });

  it('says when the plan limit resets, and omits that when the server gives no time', () => {
    expect(
      harnessFailureCopy(failure('quota_exhausted', '2026-10-17T14:00:00Z'), names).title,
    ).toBe('Plan limit reached · resets at 2026-10-17T14:00:00Z');
    expect(harnessFailureCopy(failure('quota_exhausted'), names).title).toBe('Plan limit reached');
  });

  it('names the missing folder and offers to choose another', () => {
    const copy = harnessFailureCopy(failure('directory_unavailable'), names);
    expect(copy.title).toBe('The folder ~/repo isn’t available');
    expect(copy.action).toBe('choose_folder');
  });

  it('reports an unknown outcome when the source is unsure', () => {
    expect(harnessFailureCopy(failure('source_outcome_unknown'), names)).toMatchObject({
      title: 'The previous turn’s outcome is unknown',
      action: 'check_status',
    });
  });

  it('shows the plain error, never the server message, for every other code', () => {
    for (const code of [
      'ownership_lost',
      'capability_unsupported',
      'composition_incompatible',
      'operation_failed',
    ] as const) {
      expect(harnessFailureCopy(failure(code), names)).toEqual({
        title: PLAIN_ERROR,
        body: null,
        action: null,
      });
    }
  });
});
