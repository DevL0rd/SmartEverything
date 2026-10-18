import { describe, expect, it } from 'vitest';
import { footerText } from './footer-model';
import { snapshotFixture } from './snapshot-fixture';
import { rankedEntries } from './top-model';

describe('rankedEntries', () => {
  it('sizes each bar against the largest entry and speaks the count with its noun', () => {
    const entries = rankedEntries(
      [
        { name: 'doubleclick.net', count: 1_900 },
        { name: 'ads.tiktok.com', count: 950 },
        { name: 'third.example', count: 1 },
      ],
      2,
      'blocked lookups',
    );
    expect(entries).toEqual([
      {
        key: 'doubleclick.net',
        label: 'doubleclick.net',
        value: '1,900',
        share: 1,
        spoken: 'doubleclick.net, 1,900 blocked lookups',
      },
      {
        key: 'ads.tiktok.com',
        label: 'ads.tiktok.com',
        value: '950',
        share: 0.5,
        spoken: 'ads.tiktok.com, 950 blocked lookups',
      },
    ]);
  });
});

describe('footerText', () => {
  it('joins the version and the update cadence while online', () => {
    expect(footerText(snapshotFixture())).toBe(
      'AdGuard Home v0.107.55 · Updates every 10 s while you’re looking.',
    );
    expect(footerText(snapshotFixture({ cadence: 'slow', intervalSeconds: 60 }))).toBe(
      'AdGuard Home v0.107.55 · Updates every 60 s in the background.',
    );
  });

  it('hides the cadence once the page is stale', () => {
    expect(footerText(snapshotFixture({ connection: { state: 'paused' } }))).toBe(
      'AdGuard Home v0.107.55',
    );
  });
});
