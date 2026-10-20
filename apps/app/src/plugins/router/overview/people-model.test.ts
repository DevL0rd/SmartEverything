import type { PresencePerson } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { presenceLabel, presenceLine, trackedPeople } from './people-model';

function person(name: string, home: boolean, tracked = true): PresencePerson {
  return {
    id: `00000000-0000-4000-8000-${name.length.toString().padStart(12, '0')}`,
    name,
    profile: false,
    tracked,
    home,
    since: null,
    viaPhone: false,
    devices: [],
  };
}

describe('trackedPeople', () => {
  it('leaves out people whose presence is switched off', () => {
    const shown = trackedPeople([person('Sam', true), person('Dana', false, false)]);
    expect(shown.map((entry) => entry.name)).toEqual(['Sam']);
  });
});

describe('presence text', () => {
  it('lists each person as home or away and counts who is home', () => {
    const presence = [person('Dana', true), person('Sam', false)];
    expect(presenceLine(presence)).toBe('Dana home · Sam away');
    expect(presenceLabel(presence)).toBe('People home: 1 person of 2. Dana home · Sam away');
  });
});
