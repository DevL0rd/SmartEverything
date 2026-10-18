import { describe, expect, it } from 'vitest';
import { TEMPLATE_SCOPES, NO_CONDITIONS, type PersonAccess } from '@smarteverything/domain';
import {
  canEndNow,
  conditionsText,
  deviceRoleOf,
  endedText,
  endsText,
  roleChange,
  standingOf,
  standingText,
  timeLeftText,
  windowSegments,
} from './standing';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');

const ZONE = 'UTC';

function person(change: Partial<PersonAccess> = {}): PersonAccess {
  return {
    profile_id: '00000000-0000-4000-8000-000000000001',
    role: 'member',
    template: 'adult',
    scopes: TEMPLATE_SCOPES.adult,
    budget: null,
    conditions: NO_CONDITIONS,
    expires_at: null,
    updated_at: '2026-10-01T00:00:00.000Z',
    ...change,
  };
}

describe('standingOf', () => {
  it('shows an owner as full access whatever the conditions say', () => {
    const owner = person({
      role: 'owner',
      template: 'owner',
      conditions: { home_only: true, schedule: { from: '00:00', to: '23:59', urgent: false } },
    });
    expect(standingOf(owner, NOW, ZONE)).toEqual({ kind: 'owner' });
  });

  it('shows a guest whose end time passed as ended', () => {
    const guest = person({ role: 'guest', expires_at: '2026-10-18T11:59:00.000Z' });
    expect(standingOf(guest, NOW, ZONE)).toEqual({ kind: 'ended' });
  });

  it('pauses a member inside the paused window and names when it ends', () => {
    const member = person({
      conditions: { home_only: false, schedule: { from: '11:00', to: '13:30', urgent: false } },
    });
    expect(standingOf(member, NOW, ZONE)).toEqual({ kind: 'paused', resumesAt: '13:30' });
  });

  it('reads the paused window in the home time zone, not the phone zone', () => {
    const member = person({
      conditions: { home_only: false, schedule: { from: '18:00', to: '20:00', urgent: false } },
    });
    expect(standingOf(member, NOW, 'UTC').kind).toBe('active');
    expect(standingOf(member, NOW, 'Asia/Bangkok').kind).toBe('paused');
  });

  it('keeps a member active with the end time of a guest visible', () => {
    const guest = person({ role: 'guest', expires_at: '2026-10-19T12:00:00.000Z' });
    expect(standingOf(guest, NOW, ZONE)).toEqual({
      kind: 'active',
      endsAt: '2026-10-19T12:00:00.000Z',
    });
  });
});

describe('standingText', () => {
  it('says how long a guest has left', () => {
    expect(standingText({ kind: 'active', endsAt: '2026-10-21T12:00:00.000Z' }, NOW)).toBe(
      'Active, ends in 3 d',
    );
    expect(standingText({ kind: 'active', endsAt: null }, NOW)).toBe('Active');
    expect(standingText({ kind: 'paused', resumesAt: '07:00' }, NOW)).toBe('Paused until 07:00');
  });
});

describe('timeLeftText', () => {
  it('picks the largest whole unit', () => {
    expect(timeLeftText('2026-10-18T12:00:30.000Z', NOW)).toBe('under a minute');
    expect(timeLeftText('2026-10-18T12:45:00.000Z', NOW)).toBe('45 min');
    expect(timeLeftText('2026-10-18T17:00:00.000Z', NOW)).toBe('5 h');
    expect(timeLeftText('2026-10-25T12:00:00.000Z', NOW)).toBe('7 d');
  });
});

describe('conditionsText', () => {
  it('lists every limit that is on', () => {
    expect(conditionsText(NO_CONDITIONS)).toBe('No limits');
    expect(
      conditionsText({ home_only: true, schedule: { from: '22:00', to: '07:00', urgent: false } }),
    ).toBe('Home network only · Paused 22:00–07:00');
  });
});

describe('windowSegments', () => {
  it('draws a same-day window as one segment', () => {
    expect(windowSegments({ from: '06:00', to: '12:00', urgent: false })).toEqual([
      { start: 0.25, end: 0.5 },
    ]);
  });

  it('splits an overnight window at midnight', () => {
    expect(windowSegments({ from: '18:00', to: '06:00', urgent: false })).toEqual([
      { start: 0.75, end: 1 },
      { start: 0, end: 0.25 },
    ]);
  });

  it('draws nothing when there is no window or it is empty', () => {
    expect(windowSegments(null)).toEqual([]);
    expect(windowSegments({ from: '08:00', to: '08:00', urgent: false })).toEqual([]);
  });
});

describe('roleChange', () => {
  it('clears the end time when a person becomes an owner', () => {
    expect(roleChange('owner', person({ expires_at: '2026-10-19T00:00:00.000Z' }), NOW)).toEqual({
      role: 'owner',
      template: 'owner',
      expires_at: null,
    });
  });

  it('gives a new guest a one day end time and keeps an existing end time', () => {
    expect(roleChange('guest', person(), NOW)).toEqual({
      role: 'guest',
      template: 'guest',
      expires_at: '2026-10-19T12:00:00.000Z',
    });
    expect(roleChange('guest', person({ expires_at: '2026-10-30T00:00:00.000Z' }), NOW)).toEqual({
      role: 'guest',
      template: 'guest',
    });
  });

  it('leaves the end time alone when someone becomes a member', () => {
    expect(roleChange('member', person(), NOW)).toEqual({ role: 'member', template: 'adult' });
  });
});

describe('deviceRoleOf', () => {
  it('pairs the phone of an owner as an owner and every other phone as a member', () => {
    expect(deviceRoleOf('owner')).toBe('owner');
    expect(deviceRoleOf('member')).toBe('member');
    expect(deviceRoleOf('guest')).toBe('member');
  });
});

describe('endsText', () => {
  it('says never, the time left, or that the access ended', () => {
    expect(endsText(null, NOW)).toBe('Never');
    expect(endsText('2026-10-18T14:00:00.000Z', NOW)).toBe('In 2 h');
    expect(endsText('2026-10-18T11:00:00.000Z', NOW)).toBe('Ended');
  });
});

describe('endedText', () => {
  it('says how long ago the access ended', () => {
    expect(endedText('2026-10-18T10:00:00.000Z', NOW)).toBe('Ended 2 h ago');
    expect(endedText('2026-10-15T12:00:00.000Z', NOW)).toBe('Ended 3 d ago');
  });
});

describe('canEndNow', () => {
  it('offers ending access only while the person still has access', () => {
    expect(canEndNow(standingOf(person(), NOW, ZONE))).toBe(true);
    expect(
      canEndNow(
        standingOf(
          person({
            conditions: {
              home_only: false,
              schedule: { from: '11:00', to: '13:00', urgent: false },
            },
          }),
          NOW,
          ZONE,
        ),
      ),
    ).toBe(true);
    expect(
      canEndNow(standingOf(person({ expires_at: '2026-10-18T11:00:00.000Z' }), NOW, ZONE)),
    ).toBe(false);
    expect(canEndNow(standingOf(person({ role: 'owner' }), NOW, ZONE))).toBe(false);
  });
});
