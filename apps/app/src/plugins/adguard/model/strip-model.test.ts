import { describe, expect, it } from 'vitest';
import { clock } from '../../../format/time';
import { snapshotFixture, statsFixture } from './snapshot-fixture';
import { stripItems } from './strip-model';

const HREF = {
  pathname: '/device/[deviceId]/[section]',
  params: { deviceId: 'd', section: 'filters' },
} as const;

describe('stripItems', () => {
  const filters = [
    { id: 1, name: 'A', url: 'u', enabled: true, rules: 10, updatedAt: null, allowList: false },
    { id: 2, name: 'B', url: 'u', enabled: false, rules: 10, updatedAt: null, allowList: false },
  ];

  it('gives six tiles so two and three columns both fill their rows', () => {
    const items = stripItems(snapshotFixture({ filters }), statsFixture(), HREF);
    expect(items.map((item) => item.label)).toEqual([
      'Lookups',
      'Blocked',
      'Answer time',
      'Filter lists',
      'Malware',
      'Adult',
    ]);
  });

  it('keeps malware and adult apart and counts the lists that are on', () => {
    const items = stripItems(snapshotFixture({ filters }), statsFixture(), HREF);
    expect(items.find((item) => item.key === 'malware')?.value).toBe('12');
    expect(items.find((item) => item.key === 'adult')?.value).toBe('3');
    expect(items.find((item) => item.key === 'lists')).toMatchObject({
      value: '1',
      caption: 'of 2 on',
      href: HREF,
    });
    expect(items.find((item) => item.key === 'blocked')?.caption).toBe('18.4 %');
  });

  it('dims every tile and says when the reading is from once the page is stale', () => {
    const snapshot = snapshotFixture({ connection: { state: 'paused' }, filters });
    const items = stripItems(snapshot, statsFixture(), HREF);
    expect(items.every((item) => item.stale === true)).toBe(true);
    expect(items.every((item) => item.caption === `as of ${clock(snapshot.at)}`)).toBe(true);
  });
});
