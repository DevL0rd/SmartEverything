import { describe, expect, it } from 'vitest';
import {
  addressOf,
  defaultCountryOf,
  exportNameOf,
  feedStatusOf,
  importReportOf,
  reachText,
  refreshOptionsOf,
  refreshText,
  regionNameOf,
  subscriptionNameOf,
} from './feeds-model';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const REGIONS = [
  {
    country: 'DE',
    name: 'Germany',
    states: [
      { code: 'BE', name: 'Berlin' },
      { code: 'BY', name: 'Bavaria' },
    ],
  },
  { country: 'CH', name: 'Switzerland', states: [] },
];
const ICS = {
  kind: 'ics',
  url: 'https://example.com/a.ics',
  refresh_minutes: 360,
  etag: null,
  last_modified: null,
  fetched_at: null,
  failure: null,
} as const;

describe('subscription addresses', () => {
  it('takes https, http and calendar links and explains anything else', () => {
    expect(addressOf('  https://example.com/a.ics ')).toEqual({
      ok: true,
      url: 'https://example.com/a.ics',
    });
    expect(addressOf('webcal://example.com/a.ics').ok).toBe(true);
    expect(addressOf('')).toEqual({ ok: false, reason: null });
    const wrong = addressOf('ftp://example.com/a.ics');
    expect(wrong.ok).toBe(false);
    expect(wrong.ok ? null : wrong.reason).toMatch(/https/);
  });

  it('names a subscription after its host', () => {
    expect(subscriptionNameOf('webcal://www.calendars.example.org/x.ics')).toBe(
      'calendars.example.org',
    );
  });
});

describe('refresh times', () => {
  it('reads minutes as words', () => {
    expect(refreshText(60)).toBe('hour');
    expect(refreshText(360)).toBe('6 hours');
    expect(refreshText(1440)).toBe('day');
    expect(refreshText(10080)).toBe('week');
    expect(refreshText(45)).toBe('45 minutes');
  });

  it('keeps a refresh time the feed set that is not one of the choices', () => {
    const values = refreshOptionsOf(90).map((option) => option.value);
    expect(values).toEqual(['60', '90', '180', '360', '720', '1440', '10080']);
    expect(refreshOptionsOf(360)).toHaveLength(6);
  });
});

describe('feed status', () => {
  it('names the region of a holidays calendar', () => {
    expect(feedStatusOf({ kind: 'holidays', country: 'DE', state: 'BY' }, NOW, REGIONS).text).toBe(
      'Bavaria, Germany',
    );
    expect(regionNameOf(REGIONS, 'CH', null)).toBe('Switzerland');
    expect(regionNameOf([], 'FR', null)).toBe('FR');
  });

  it('shows when a subscription last refreshed or why it failed', () => {
    expect(feedStatusOf(ICS, NOW, []).text).toBe('Not fetched yet · every 6 hours');
    expect(feedStatusOf({ ...ICS, fetched_at: '2026-11-14T07:00:00.000Z' }, NOW, [])).toEqual({
      text: 'Refreshed 3 h ago · every 6 hours',
      tone: 'variant',
    });
    expect(
      feedStatusOf(
        { ...ICS, failure: { at: '2026-11-14T09:30:00.000Z', reason: 'The server answered 503' } },
        NOW,
        [],
      ),
    ).toEqual({ text: 'Refresh failed 30 min ago: The server answered 503', tone: 'critical' });
  });
});

describe('import report', () => {
  it('counts what was added and lists every part that was not used', () => {
    const report = importReportOf({
      added: 4,
      updated: 1,
      unchanged: 2,
      unsupported: [
        { part: 'attachment', detail: 'Attachments are not imported', count: 3 },
        { part: 'component', detail: 'Free and busy blocks are not imported', count: 1 },
      ],
    });
    expect(report.headline).toBe('7 items imported');
    expect(report.counts.map((entry) => entry.count)).toEqual([4, 1, 2]);
    expect(report.skipped).toEqual([
      'Attachments are not imported (3 times)',
      'Free and busy blocks are not imported',
    ]);
    expect(importReportOf({ added: 0, updated: 0, unchanged: 0, unsupported: [] }).headline).toBe(
      'Nothing in this file could be imported',
    );
  });
});

describe('export and feed links', () => {
  it('makes a safe file name', () => {
    expect(exportNameOf('Family / Sam')).toBe('Family Sam.ics');
    expect(exportNameOf('???')).toBe('calendar.ics');
  });

  it('says plainly where a published address works', () => {
    const link = {
      collection_id: 'c0000000-0000-4000-8000-000000000001',
      token: 'a'.repeat(43),
      url: 'https://home.example.com/cal/x.ics',
      reach: 'home',
      created_at: '2026-11-14T07:00:00.000Z',
    } as const;
    expect(reachText(link)).toBe('Works at home only, the hub has no public address.');
    expect(reachText({ ...link, reach: 'public' })).toMatch(/Anyone with this address/);
  });

  it('defaults holidays to the home country when it has a calendar', () => {
    expect(defaultCountryOf(REGIONS, 'CH')).toBe('CH');
    expect(defaultCountryOf(REGIONS, 'FR')).toBe('DE');
    expect(defaultCountryOf([], 'FR')).toBeNull();
  });
});
