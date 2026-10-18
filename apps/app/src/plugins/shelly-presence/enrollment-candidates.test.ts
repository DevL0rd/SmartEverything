import { describe, expect, it } from 'vitest';
import { unpairedCandidates } from './enrollment-settings';

const candidate = (
  name: string,
  address: string,
): { name: string; address: string; host: string; generation: string } => ({
  name,
  address,
  host: `${name}.local`,
  generation: '4',
});

describe('unpairedCandidates', () => {
  it('shows one entry per sensor and prefers IPv4', () => {
    const list = unpairedCandidates(
      [
        candidate('Presence-A', 'http://[fe80::1]:80'),
        candidate('Presence-A', 'http://192.168.1.5:80'),
      ],
      [],
    );
    expect(list.map((entry) => entry.address)).toStrictEqual(['http://192.168.1.5:80']);
  });

  it('hides sensors that are already paired', () => {
    const list = unpairedCandidates(
      [
        candidate('Presence-A', 'http://192.168.1.5:80'),
        candidate('Presence-B', 'http://192.168.1.6:80'),
      ],
      [{ address: 'http://[fe80::1]:80', info: { id: 'presence-a' } }],
    );
    expect(list.map((entry) => entry.name)).toStrictEqual(['Presence-B']);
  });
});
