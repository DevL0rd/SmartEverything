import type { AdGuardQuery } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { lookupCaption, recentLookups } from './recent-lookups';

function query(client: string, domain: string): AdGuardQuery {
  return {
    time: '2026-10-17T09:00:00.000Z',
    domain,
    type: 'A',
    client,
    clientName: null,
    outcome: 'allowed',
    reason: 'NotFilteredNotFound',
    rule: null,
    elapsedMs: null,
    upstream: null,
    cached: false,
  };
}

describe('recentLookups', () => {
  it('keeps only the lookups made by the address, newest first, at most five', () => {
    const entries = [
      query('192.168.1.20', 'a.example.'),
      query('192.168.1.99', 'other.example.'),
      ...['b', 'c', 'd', 'e', 'f', 'g'].map((name) => query('192.168.1.20', `${name}.example.`)),
    ];
    expect(recentLookups(entries, '192.168.1.20').map((entry) => entry.domain)).toEqual([
      'a.example.',
      'b.example.',
      'c.example.',
      'd.example.',
      'e.example.',
    ]);
  });

  it('gives nothing when the address made no lookups', () => {
    expect(recentLookups([query('192.168.1.99', 'x.example.')], '192.168.1.20')).toEqual([]);
  });
});

describe('lookupCaption', () => {
  it('shows no caption until the lookups were read', () => {
    expect(lookupCaption(false, 0)).toBeUndefined();
  });

  it('says none yet when the read succeeded with no lookups', () => {
    expect(lookupCaption(true, 0)).toBe('None yet');
  });

  it('counts the lookups shown', () => {
    expect(lookupCaption(true, 3)).toBe('Last 3');
  });
});
