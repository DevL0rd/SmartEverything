import { EMPTY_IR_REMOTE_STATE, type IrRemoteState } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { RemoteStatus } from './remote-lines';

vi.mock('../log/log-model', () => ({ cardTime: (at: string): string => at.slice(11, 16) }));

const { chipOf, effectiveOn, failureOf, failureText, lineOf } = await import('./remote-lines');

const SENT: IrRemoteState = {
  ...EMPTY_IR_REMOTE_STATE,
  on: true,
  sentKey: 'KEY_POWER',
  sentAt: '2026-10-18T14:02:00.000Z',
};

function status(patch: Partial<RemoteStatus>): RemoteStatus {
  return {
    online: true,
    blasterName: 'Living Room IR',
    assumed: EMPTY_IR_REMOTE_STATE,
    confirmation: null,
    failure: null,
    ...patch,
  };
}

describe('chipOf', () => {
  it('never claims on without saying assumed', () => {
    expect(chipOf(status({ assumed: SENT }))).toEqual({ label: 'Assumed', tone: 'info' });
    expect(chipOf(status({ assumed: { ...SENT, on: false } }))).toEqual({
      label: 'Assumed off',
      tone: 'neutral',
    });
    expect(chipOf(status({}))).toEqual({ label: 'Not sent yet', tone: 'neutral' });
  });

  it('says confirmed only when a linked sensor confirms', () => {
    const confirmation = { on: true, by: 'Desk plug', watts: 38 };
    expect(chipOf(status({ assumed: SENT, confirmation }))).toEqual({
      label: 'Confirmed by Desk plug',
      tone: 'positive',
    });
  });

  it('shows a failure and an offline blaster ahead of the assumed state', () => {
    expect(chipOf(status({ assumed: SENT, failure: 'x' })).tone).toBe('critical');
    expect(chipOf(status({ assumed: SENT, online: false }))).toEqual({
      label: 'Offline',
      tone: 'neutral',
    });
  });
});

describe('lineOf', () => {
  it('explains that IR cannot report back before anything was sent', () => {
    expect(lineOf(status({})).text).toBe('IR can’t report back');
  });

  it('shows the last key and when it went out, without repeating the assumed chip', () => {
    expect(lineOf(status({ assumed: SENT })).text).toBe('Sent Power 14:02');
  });

  it('keeps the last known state while the blaster is offline', () => {
    expect(lineOf(status({ assumed: SENT, online: false }))).toEqual({
      text: 'Sent Power 14:02',
      tone: 'variant',
    });
  });

  it('shows the real reading when a sensor confirms', () => {
    const line = lineOf(status({ confirmation: { on: true, by: 'Desk plug', watts: 38.4 } }));
    expect(line.text).toBe('Drawing 38 W');
    expect(lineOf(status({ confirmation: { on: false, by: 'Desk plug', watts: 1 } })).text).toBe(
      'Idle at 1 W',
    );
  });
});

describe('effectiveOn', () => {
  it('follows the sensor over the assumed state', () => {
    const confirmation = { on: false, by: 'Desk plug', watts: 0 };
    expect(effectiveOn(status({ assumed: SENT, confirmation }))).toBe(false);
    expect(effectiveOn(status({ assumed: SENT }))).toBe(true);
    expect(effectiveOn(status({}))).toBeNull();
  });
});

describe('failureOf', () => {
  it('shows a failure in critical tone and nothing otherwise', () => {
    const failure = failureText(true, 'Living Room IR');
    expect(failureOf(status({ assumed: SENT, failure }))).toEqual({
      text: 'Not sent: Living Room IR didn’t answer',
      tone: 'critical',
    });
    expect(failureText(false, 'Living Room IR')).toBe('Not sent: Living Room IR is offline');
    expect(failureOf(status({ assumed: SENT }))).toBeNull();
  });
});
