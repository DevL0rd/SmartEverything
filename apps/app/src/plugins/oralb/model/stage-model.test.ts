import { ORALB_IDENTITY, ORALB_CHARACTERISTICS, oralbProfileOf } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { oralbFrameOf, oralbViewOf } from '../../toothbrush/model/fixtures';
import {
  HANDLE_COLUMN,
  connectedOf,
  finishedFrame,
  gaugePx,
  isLiveSource,
  layoutOf,
  liveQuarters,
  pacerOn,
  sectionCaption,
  sectionsOf,
  sourceChip,
  stageKindOf,
} from './stage-model';

function viewWithSectors(sectors: number): ReturnType<typeof oralbViewOf> {
  const base = oralbViewOf();
  const identity = ORALB_IDENTITY.parse({
    address: 'A0:14:3D:11:22:33',
    advertAddress: 'A0:14:3D:11:22:33',
    protocol: 8,
    modelId: 0x36,
    firmware: 82,
    gapName: null,
    services: [],
    present: [...ORALB_CHARACTERISTICS],
    ff05Length: 8,
    ff05Runtime: null,
    ff0bLength: 10,
    ff2bLength: 4,
    ff2dLength: 5,
    advertHex: '08365208320000050001',
    clock: null,
  });
  const schedule = Array.from({ length: 8 }, (_, index) => (index < sectors ? 20 : 0));
  return { ...base, profile: oralbProfileOf(identity, schedule) };
}

describe('which stage is drawn', () => {
  it('draws the quarter arch for four sectors and for a pacer that is off', () => {
    const frame = oralbFrameOf({ activity: 'brushing' });
    expect(stageKindOf(viewWithSectors(4), frame)).toBe('arch');
    expect(stageKindOf(viewWithSectors(0), frame)).toBe('arch');
  });

  it('draws a section strip for any other sector count', () => {
    const frame = oralbFrameOf({ activity: 'brushing' });
    expect(stageKindOf(viewWithSectors(6), frame)).toBe('sections');
    expect(stageKindOf(viewWithSectors(3), frame)).toBe('sections');
  });

  it('keeps the timer ring for Tongue Clean', () => {
    const frame = oralbFrameOf({ activity: 'brushing', mode: 'tongue_clean' });
    expect(stageKindOf(viewWithSectors(4), frame)).toBe('ring');
  });

  it('knows whether the pacer is on', () => {
    expect(pacerOn(viewWithSectors(4))).toBe(true);
    expect(pacerOn(viewWithSectors(0))).toBe(false);
  });
});

describe('the live quarters', () => {
  it('fills from the real seconds of the handle against its pacer', () => {
    const view = oralbViewOf();
    const frame = oralbFrameOf({
      activity: 'brushing',
      zone: 2,
      zoneSeconds: [30, 12, 0, 0],
      routineS: 120,
    });
    const quarters = liveQuarters(view, frame);
    expect(quarters.map((quarter) => quarter.state)).toEqual(['done', 'current', 'todo', 'todo']);
    expect(quarters[1]?.fill).toBeCloseTo(0.4);
  });

  it('judges a finished session by what was reached', () => {
    const frame = oralbFrameOf({ activity: 'standby', zoneSeconds: [30, 18, 0, 0] });
    expect(finishedFrame(frame)).toBe(true);
    expect(liveQuarters(oralbViewOf(), frame).map((quarter) => quarter.state)).toEqual([
      'done',
      'partial',
      'missed',
      'missed',
    ]);
  });

  it('numbers the sections from the handle sector, then from the clock', () => {
    const view = viewWithSectors(6);
    expect(sectionsOf(view, oralbFrameOf({ zone: 3 }))).toEqual({ count: 6, current: 3 });
    expect(sectionsOf(view, oralbFrameOf({ zone: null, elapsedS: 60, routineS: 120 }))).toEqual({
      count: 6,
      current: 4,
    });
    expect(sectionCaption({ count: 6, current: 3 })).toBe('Section 3 of 6');
  });
});

describe('the source chip', () => {
  const view = oralbViewOf();
  const NOW = Date.parse('2026-10-18T07:30:00.000Z');

  it('names the live source while brushing', () => {
    const advert = oralbFrameOf({ activity: 'brushing', liveSource: 'advert' });
    const link = oralbFrameOf({ activity: 'brushing', liveSource: 'link' });
    expect(sourceChip(advert, view, NOW)).toBe('Live, from the broadcast');
    expect(sourceChip(link, view, NOW)).toBe('Live, connected');
    expect(isLiveSource(advert)).toBe(true);
    expect(connectedOf(link)).toBe(true);
    expect(connectedOf(advert)).toBe(false);
  });

  it('shows when it was last heard when nothing is live', () => {
    const idle = oralbFrameOf({ activity: 'standby', liveSource: 'link' });
    expect(isLiveSource(idle)).toBe(false);
    expect(sourceChip(idle, view, NOW)).toMatch(/^Synced /);
    const silent = oralbViewOf({ link: { lastHeardAt: null } });
    expect(sourceChip(idle, silent, NOW)).toBeNull();
  });
});

describe('the stage layout', () => {
  it('stacks on a phone, splits on a tablet and spreads on a desktop', () => {
    expect(layoutOf(360).columns).toBe('stacked');
    expect(layoutOf(700).columns).toBe('split');
    expect(layoutOf(1100).columns).toBe('wide');
  });

  it('keeps the arch inside its limits and the handle column clear of it', () => {
    for (const width of [300, 360, 412, 560, 700, 899, 900, 1200]) {
      const layout = layoutOf(width);
      expect(layout.archPx).toBeGreaterThanOrEqual(160);
      expect(layout.archPx).toBeLessThanOrEqual(300);
      if (layout.columns !== 'stacked') {
        expect(layout.detailsPx).toBeGreaterThanOrEqual(260);
        expect(HANDLE_COLUMN + layout.archPx + layout.detailsPx).toBeLessThanOrEqual(width);
      }
    }
  });

  it('draws the handle taller on a desktop', () => {
    expect(layoutOf(412).handlePx).toBe(220);
    expect(layoutOf(1200).handlePx).toBe(280);
  });

  it('keeps the gauge no wider than 190', () => {
    expect(gaugePx(1000)).toBe(190);
    expect(gaugePx(300)).toBe(165);
    expect(gaugePx(100)).toBe(120);
  });
});
