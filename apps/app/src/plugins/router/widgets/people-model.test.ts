import type { NetworkClient } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  fitRows,
  homeLine,
  homeStack,
  personLine,
  rowCapacity,
  widgetPeople,
  type WidgetPerson,
  type WidgetProfile,
} from './people-model';

function client(
  mac: string,
  profileId: string | null,
  connected: boolean,
  lastSeen: string | null = null,
): NetworkClient {
  return {
    mac,
    name: mac,
    ip: null,
    connection: 'wifi',
    band: null,
    connected,
    blocked: false,
    trafficBytesPerSecond: null,
    profileId,
    firstSeen: null,
    lastSeen,
  };
}

const PROFILES: readonly WidgetProfile[] = [
  { id: 'sam', name: 'Sam', colour: 'aqua' },
  { id: 'dana', name: 'Dana', colour: 'lime' },
  { id: 'kai', name: 'Kai', colour: 'rose' },
  { id: 'lee', name: 'Lee', colour: 'aqua' },
];

const NOW = Date.parse('2026-10-17T12:00:00.000+00:00');

function person(id: string, home: boolean, leftAt: string | null = null): WidgetPerson {
  const profile = PROFILES.find((candidate) => candidate.id === id) ?? PROFILES[0];
  if (profile === undefined) {
    throw new Error('missing fixture profile');
  }
  return { id, name: profile.name, profile, home, leftAt };
}

describe('widgetPeople', () => {
  it('lists people with a device, home first, and keeps the latest sighting of an away person', () => {
    const people = widgetPeople(
      [
        client('a', 'sam', false, '2026-10-17T07:00:00.000+00:00'),
        client('b', 'sam', false, '2026-10-17T08:12:00.000+00:00'),
        client('c', 'dana', true, '2026-10-17T11:59:00.000+00:00'),
      ],
      PROFILES,
    );
    expect(people.map((entry) => [entry.name, entry.home, entry.leftAt])).toEqual([
      ['Dana', true, null],
      ['Sam', false, '2026-10-17T08:12:00.000+00:00'],
    ]);
  });
});

describe('personLine', () => {
  it('says Home, or when the person left, or only Away when no sighting is known', () => {
    expect(personLine(person('dana', true), NOW)).toBe('Home');
    expect(personLine(person('sam', false), NOW)).toBe('Away');
    expect(personLine(person('sam', false, new Date(NOW - 60_000).toISOString()), NOW)).toMatch(
      /^Away · left today /,
    );
  });
});

describe('homeLine', () => {
  it('names up to two people, counts more, and says when nobody is home', () => {
    expect(homeLine([person('sam', false)])).toBe('Nobody home');
    expect(homeLine([person('sam', true), person('dana', false)])).toBe('Sam home');
    expect(homeLine([person('sam', true), person('dana', true)])).toBe('Sam, Dana home');
    expect(homeLine([person('sam', true), person('dana', true), person('kai', true)])).toBe(
      '3 home',
    );
  });
});

describe('homeStack', () => {
  it('shows at most three people who are home and counts the rest', () => {
    const all = ['sam', 'dana', 'kai', 'lee'].map((id) => person(id, true));
    const { shown, more } = homeStack([...all, person('sam', false)]);
    expect(shown.map((entry) => entry.id)).toEqual(['sam', 'dana', 'kai']);
    expect(more).toBe(1);
  });
});

describe('fitRows', () => {
  const four = ['sam', 'dana', 'kai', 'lee'].map((id) => person(id, true));

  it('shows everyone that fits', () => {
    expect(fitRows(four, 4)).toEqual({ shown: four, more: 0 });
  });

  it('gives the last slot to a more line when people overflow', () => {
    const { shown, more } = fitRows(four, 3);
    expect(shown).toHaveLength(2);
    expect(more).toBe(2);
  });

  it('always shows one person', () => {
    expect(fitRows(four, 1).shown).toHaveLength(1);
  });
});

describe('rowCapacity', () => {
  it('counts 48 px rows after the reserved height and never drops below one', () => {
    expect(rowCapacity(250, 0)).toBe(5);
    expect(rowCapacity(250, 22)).toBe(4);
    expect(rowCapacity(20, 0)).toBe(1);
  });
});
