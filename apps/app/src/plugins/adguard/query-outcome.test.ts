import type { AdGuardQuery } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { statsFixture } from './model/snapshot-fixture';
import {
  deviceName,
  filterCounts,
  filterOf,
  lookupSections,
  ownRulesOf,
  plainDomain,
  OUTCOME_LOOK,
  OUTCOME_TEXT,
} from './query-outcome';

const query = (patch: Partial<AdGuardQuery> = {}): AdGuardQuery => ({
  time: '2026-10-17T12:00:00.000Z',
  domain: 'doubleclick.net',
  type: 'A',
  client: '192.168.50.20',
  clientName: null,
  outcome: 'allowed',
  reason: '',
  rule: null,
  elapsedMs: 3,
  upstream: null,
  cached: false,
  ...patch,
});

const NOW = Date.parse('2026-10-17T13:00:00.000Z');

describe('outcome words and looks', () => {
  it('names every outcome and gives each a distinct icon', () => {
    expect(OUTCOME_TEXT).toEqual({
      blocked: 'Blocked',
      allowed: 'Allowed',
      rewritten: 'Rewritten',
    });
    const icons = Object.values(OUTCOME_LOOK).map((look) => look.icon);
    expect(new Set(icons).size).toBe(3);
  });
});

describe('plainDomain and deviceName', () => {
  it('drops the root dot only', () => {
    expect(plainDomain('example.net.')).toBe('example.net');
    expect(plainDomain('example.net')).toBe('example.net');
  });

  it('prefers the client name over its address', () => {
    expect(deviceName(query({ clientName: 'Dana’s phone' }))).toBe('Dana’s phone');
    expect(deviceName(query())).toBe('192.168.50.20');
  });
});

describe('filterOf', () => {
  it('reads a deep-link filter and treats anything else as all', () => {
    expect(filterOf('blocked')).toBe('blocked');
    expect(filterOf('allowed')).toBe('allowed');
    expect(filterOf('nonsense')).toBe('all');
    expect(filterOf(null)).toBe('all');
  });
});

describe('filterCounts', () => {
  it('counts allowed as everything that was not blocked', () => {
    expect(filterCounts(statsFixture({ queries: 30_604, blocked: 6_420 }))).toEqual({
      all: 30_604,
      blocked: 6_420,
      allowed: 24_184,
    });
  });
});

describe('ownRulesOf', () => {
  const rules = ['||ads.example.com^', '@@||ads.example.com^', '||other.net^', '! comment'];

  it('finds the rules the app writes for exactly this domain', () => {
    expect(ownRulesOf(rules, 'ads.example.com')).toEqual([
      '||ads.example.com^',
      '@@||ads.example.com^',
    ]);
  });

  it('ignores other domains and sub-domains', () => {
    expect(ownRulesOf(rules, 'example.com')).toEqual([]);
    expect(ownRulesOf(rules, 'x.ads.example.com')).toEqual([]);
  });
});

describe('lookupSections', () => {
  it('groups newest-first lookups by day with a readable title', () => {
    const sections = lookupSections(
      [
        query({ time: '2026-10-17T12:00:00.000Z' }),
        query({ time: '2026-10-17T11:00:00.000Z', domain: 'b.net' }),
        query({ time: '2026-10-16T12:00:00.000Z', domain: 'c.net' }),
      ],
      NOW,
    );
    expect(sections.map((section) => [section.title, section.data.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
    ]);
  });

  it('keeps identical lookups apart and keys stable when older ones load', () => {
    const twin = query();
    const first = lookupSections([twin, twin], NOW).flatMap((section) => section.data);
    expect(new Set(first.map((item) => item.key)).size).toBe(2);
    const older = query({ time: '2026-10-16T12:00:00.000Z', domain: 'old.net' });
    const grown = lookupSections([twin, twin, older], NOW).flatMap((section) => section.data);
    expect(grown.slice(0, 2).map((item) => item.key)).toEqual(first.map((item) => item.key));
  });

  it('returns no sections for an empty log', () => {
    expect(lookupSections([], NOW)).toEqual([]);
  });
});
