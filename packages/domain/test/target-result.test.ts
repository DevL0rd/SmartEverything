import { describe, expect, it } from 'vitest';
import {
  MEMBER_OUTCOME,
  type CommandResult,
  commandOutcome,
  memberOutcomeLine,
  memberOutcomes,
  retryable,
  skippedText,
  targetResultHeadline,
  type MemberOutcome,
} from '../src';

const A = '7b000000-0000-4000-8000-000000000001';
const B = '7b000000-0000-4000-8000-000000000002';
const C = '7b000000-0000-4000-8000-000000000003';

const changed: MemberOutcome = { status: 'changed', deviceId: A };
const pending: MemberOutcome = { status: 'pending', deviceId: B };
const offline: MemberOutcome = { status: 'skipped', deviceId: C, reason: 'offline' };

describe('the words for what happened to one member', () => {
  it('names every outcome in one wording', () => {
    expect(memberOutcomeLine('Hall lamp', changed)).toBe('Hall lamp: Changed');
    expect(memberOutcomeLine('Hall lamp', pending)).toBe('Hall lamp: Waiting');
    expect(memberOutcomeLine('Hall lamp', offline)).toBe('Hall lamp: Offline');
    expect(memberOutcomeLine('Hall lamp', { ...offline, reason: 'unsupported' })).toBe(
      'Hall lamp: Not supported',
    );
    expect(memberOutcomeLine('Hall lamp', { ...offline, reason: 'removed' })).toBe(
      'Hall lamp: No longer exists',
    );
    expect(memberOutcomeLine('Hall lamp', { ...offline, reason: 'off' })).toBe('Hall lamp: Off');
    expect(
      memberOutcomeLine('Desk', { status: 'failed', deviceId: A, reason: 'no_response' }),
    ).toBe("Desk: Didn't respond");
    expect(memberOutcomeLine('Desk', { status: 'failed', deviceId: A, reason: 'refused' })).toBe(
      'Desk: Refused the change',
    );
    expect(memberOutcomeLine('Desk', { status: 'failed', deviceId: A, reason: 'error' })).toBe(
      'Desk: Something went wrong',
    );
  });

  it('keeps the reason first and the detail after it for a failed member', () => {
    expect(
      memberOutcomeLine('Desk', {
        status: 'failed',
        deviceId: A,
        reason: 'refused',
        detail: 'Too bright',
      }),
    ).toBe('Desk: Refused the change: Too bright');
    expect(skippedText({ reason: 'unsupported', detail: 'Value is outside 1 to 100' })).toBe(
      'Value is outside 1 to 100',
    );
    expect(skippedText({ reason: 'offline' })).toBe('Offline');
  });
});

describe('the headline of a result', () => {
  it('is null when every member changed', () => {
    expect(targetResultHeadline([changed], 'light')).toBeNull();
    expect(targetResultHeadline([], 'light')).toBeNull();
  });

  it('counts failed, offline and removed members as not changed', () => {
    const failed: MemberOutcome = { status: 'failed', deviceId: A, reason: 'no_response' };
    const removed: MemberOutcome = { status: 'skipped', deviceId: B, reason: 'removed' };
    expect(targetResultHeadline([changed, failed, offline, removed], 'light')).toBe(
      "3 lights didn't change",
    );
    expect(targetResultHeadline([failed], 'device')).toBe("1 device didn't change");
  });

  it('does not count unsupported or intentionally untouched members', () => {
    const unsupported: MemberOutcome = { status: 'skipped', deviceId: A, reason: 'unsupported' };
    const untouched: MemberOutcome = { status: 'skipped', deviceId: B, reason: 'off' };
    expect(targetResultHeadline([changed, unsupported, untouched], 'light')).toBeNull();
  });

  it('adds the members still waiting', () => {
    expect(targetResultHeadline([changed, pending], 'light')).toBe('1 still waiting');
    expect(targetResultHeadline([pending, offline], 'light')).toBe(
      "1 light didn't change · 1 still waiting",
    );
  });
});

describe('what can be retried', () => {
  it('retries only members that failed', () => {
    const failed: MemberOutcome = { status: 'failed', deviceId: A, reason: 'refused' };
    expect(retryable([failed, pending, offline, changed])).toStrictEqual([A]);
    expect(retryable([pending, offline])).toStrictEqual([]);
  });
});

describe('outcomes from commands', () => {
  const result = (status: CommandResult['status'], error: string | null): CommandResult => ({
    device_id: A,
    status,
    error,
  });

  it('maps each command status', () => {
    expect(commandOutcome(result('succeeded', null))).toStrictEqual(changed);
    expect(commandOutcome(result('pending', null))).toStrictEqual({
      status: 'pending',
      deviceId: A,
    });
    expect(commandOutcome(result('running', null))).toStrictEqual({
      status: 'pending',
      deviceId: A,
    });
    expect(commandOutcome(result('expired', null))).toStrictEqual({
      status: 'failed',
      deviceId: A,
      reason: 'no_response',
    });
  });

  it('keeps the error of a failed command as the detail', () => {
    expect(commandOutcome(result('failed', 'Lamp said no'))).toStrictEqual({
      status: 'failed',
      deviceId: A,
      reason: 'refused',
      detail: 'Lamp said no',
    });
    expect(commandOutcome(result('failed', null))).toStrictEqual({
      status: 'failed',
      deviceId: A,
      reason: 'refused',
    });
    expect(commandOutcome(result('failed', ''))).toStrictEqual({
      status: 'failed',
      deviceId: A,
      reason: 'refused',
    });
  });

  it('ignores a command that belongs to no device', () => {
    expect(commandOutcome({ device_id: null, status: 'succeeded', error: null })).toBeNull();
  });

  it('puts skipped members first, then the commands', () => {
    const outcomes = memberOutcomes(
      [{ deviceId: C, reason: 'offline' }],
      [result('succeeded', null), { device_id: null, status: 'failed', error: null }],
    );
    expect(outcomes).toStrictEqual([
      { status: 'skipped', deviceId: C, reason: 'offline' },
      { status: 'changed', deviceId: A },
    ]);
    expect(outcomes.every((outcome) => MEMBER_OUTCOME.safeParse(outcome).success)).toBe(true);
  });
});
