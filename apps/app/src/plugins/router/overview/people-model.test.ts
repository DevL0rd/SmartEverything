import type { NetworkClient } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { presenceLine, presenceOf } from './people-model';

function client(mac: string, profileId: string | null, connected: boolean): NetworkClient {
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
    lastSeen: null,
  };
}

const PEOPLE = [
  { id: 'sam', name: 'Sam' },
  { id: 'dana', name: 'Dana' },
  { id: 'kai', name: 'Kai' },
];

describe('presenceOf', () => {
  it('puts people with a connected device first and skips people with no device', () => {
    const presence = presenceOf(
      [client('a', 'sam', false), client('b', 'dana', true), client('c', 'dana', false)],
      PEOPLE,
    );
    expect(presence.map((person) => [person.name, person.home])).toEqual([
      ['Dana', true],
      ['Sam', false],
    ]);
    expect(presenceLine(presence)).toBe('Dana home · Sam away');
  });

  it('is empty when no device is assigned to anyone', () => {
    expect(presenceOf([client('a', null, true)], PEOPLE)).toEqual([]);
  });
});
