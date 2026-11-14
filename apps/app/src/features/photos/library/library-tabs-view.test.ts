import { describe, expect, it } from 'vitest';
import type { PhotoRailCounts } from '@smarteverything/domain';
import {
  activeTabOf,
  hubTabOf,
  loadedLineOf,
  resultLineOf,
  shownTabs,
  spanOf,
  tabChipsOf,
} from './library-tabs-view';

const BOTH = { showCameras: true, showAi: true };

const RAIL: PhotoRailCounts = {
  library: 1200,
  albums: 4,
  places: 9,
  favourites: 31,
  videos: 88,
  screenshots: 12,
  duplicates: 0,
  backupDevices: 1,
  deleted: 0,
};

describe('the Library tabs', () => {
  it('offers On this device only where a local source exists', () => {
    expect(shownTabs(true, BOTH).map((tab) => tab.id)).toEqual([
      'all',
      'favourites',
      'videos',
      'screenshots',
      'device',
      'cameras',
      'ai',
    ]);
    expect(shownTabs(false, BOTH).map((tab) => tab.id)).not.toContain('device');
  });

  it('leaves out the sources that Photos settings turned off', () => {
    const ids = shownTabs(true, { showCameras: false, showAi: true }).map((tab) => tab.id);
    expect(ids).not.toContain('cameras');
    expect(ids).toContain('ai');
    expect(
      shownTabs(true, { showCameras: true, showAi: false }).map((tab) => tab.id),
    ).not.toContain('ai');
  });

  it('opens the tab named in the address and All for anything it does not show', () => {
    const tabs = shownTabs(false, BOTH);
    expect(activeTabOf('videos', tabs).id).toBe('videos');
    expect(activeTabOf('device', tabs).id).toBe('all');
    expect(activeTabOf(undefined, tabs).id).toBe('all');
  });

  it('carries the live count of every tab', () => {
    const chips = tabChipsOf(shownTabs(true, BOTH), {
      rail: RAIL,
      cameras: 630,
      ai: undefined,
      device: 2400,
    });
    expect(chips.map((chip) => [chip.id, chip.count])).toEqual([
      ['all', 1200],
      ['favourites', 31],
      ['videos', 88],
      ['screenshots', 12],
      ['device', 2400],
      ['cameras', 630],
      ['ai', null],
    ]);
  });

  it('names the hub tabs and refuses the others', () => {
    expect(hubTabOf('screenshots')).toBe('screenshots');
    expect(() => hubTabOf('device')).toThrow(RangeError);
  });
});

describe('the search result line', () => {
  it('counts the results and spans their months', () => {
    const buckets = [
      { month: '2026-03', count: 200 },
      { month: '2024-07', count: 14 },
    ];
    expect(resultLineOf(buckets)).toMatch(/^214 items · Jul 2024 to Mar 2026$/u);
    expect(spanOf([{ month: '2025-05', count: 1 }])).toMatch(/May 2025/u);
    expect(resultLineOf([])).toBeNull();
  });

  it('says when more results are still to load', () => {
    expect(loadedLineOf(1, true)).toBe('1 item');
    expect(loadedLineOf(40, false)).toBe('40 items so far');
  });
});
