import { describe, expect, it } from 'vitest';
import { nextDelayMs, type CadenceInput } from '../../../src/plugins/builtin/printer/cadence';

const BASE: CadenceInput = {
  settings: { idleSeconds: 30, activeSeconds: 3 },
  viewed: false,
  active: false,
  power: 'awake',
  failures: 0,
  busyStreak: 0,
  authBlocked: false,
};

describe('printer read cadence', () => {
  it('reads every thirty seconds while idle, so a missed push is caught', () => {
    expect(nextDelayMs(BASE)).toBe(30_000);
  });

  it('reads every three seconds while the page is open or a job is active', () => {
    expect(nextDelayMs({ ...BASE, viewed: true })).toBe(3_000);
    expect(nextDelayMs({ ...BASE, active: true })).toBe(3_000);
  });

  it('reads every sixty seconds while the printer sleeps', () => {
    expect(nextDelayMs({ ...BASE, power: 'standby' })).toBe(60_000);
  });

  it('stops reading when the printer wants a password', () => {
    expect(nextDelayMs({ ...BASE, authBlocked: true })).toBeNull();
  });

  it('backs off after failures and after busy answers', () => {
    expect(nextDelayMs({ ...BASE, failures: 1 })).toBe(1_000);
    expect(nextDelayMs({ ...BASE, busyStreak: 2 })).toBe(120_000);
  });
});
