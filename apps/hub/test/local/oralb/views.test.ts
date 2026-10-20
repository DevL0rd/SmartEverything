import { ApiError, BRUSH_VIEW, type BrushReadQuery, type BrushView } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import type { Viewer } from '../../../src/local/toothbrush/access';
import { homeClock } from '../../../src/local/toothbrush/clock';
import { readBrush, type ViewDeps } from '../../../src/local/toothbrush/views';
import { bytes, long, oralbRig, pressureHex, type OralbRig } from './rig';

let rig: OralbRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

function depsOf(brushed: OralbRig): ViewDeps {
  return {
    store: brushed.test.store,
    fleet: brushed.fleet,
    clock: homeClock(brushed.test.store),
    holder: () => null,
    series: () => ({
      resolution: 'hour',
      points: [
        { at: brushed.at(0), value: 40, minimum: 40, maximum: 40 },
        { at: brushed.at(10), value: 30, minimum: 30, maximum: 30 },
        { at: brushed.at(20), value: 90, minimum: 90, maximum: 90 },
        { at: brushed.at(30), value: 80, minimum: 80, maximum: 80 },
      ],
    }),
    now: brushed.clock.now,
  };
}

function viewer(brushed: OralbRig, who: 'owner' | 'member'): Viewer {
  const person = who === 'owner' ? brushed.owner : brushed.member;
  return { clientId: person.client.id, role: who, profileId: person.profile.id };
}

function read(brushed: OralbRig, who: 'owner' | 'member', query: BrushReadQuery): BrushView {
  return BRUSH_VIEW.parse(readBrush(depsOf(brushed), brushed.row(), viewer(brushed, who), query));
}

function wake(brushed: OralbRig): void {
  brushed.batch(0, {
    phase: 'linked',
    frames: [
      brushed.frame('ff02', bytes(0x36, 8, 82), 0),
      brushed.frame('ff04', bytes(2, 0), 0),
      brushed.frame('ff05', `${bytes(80)}${bytes(0x10, 0x0e)}`, 0),
      brushed.frame('ff25', '0b00010302040607', 0),
      brushed.frame('ff26', '1e1e1e1e00000000', 0),
      brushed.frame('ff2b', '80ff0000', 0),
      brushed.frame('ff2d', `${bytes(0)}${bytes(30, 0, 88, 2)}`, 0),
      brushed.frame('ff22', long(838_854_030), 0),
    ],
  });
}

describe('the pages of an Oral-B brush', () => {
  it('shows the head countdown, the handle block and the model for the owner', async () => {
    const brushed = (rig = await oralbRig());
    wake(brushed);
    const state = read(brushed, 'owner', { view: 'state' });
    expect(state).toMatchObject({
      model: 'iO9',
      family: null,
      profile: { brand: 'oralb', protocol: 8, pressure: 'force', zones: 4, zoneSource: 'pacer' },
      head: {
        state: 'fitted',
        daysLeft: 30,
        secondsLeft: 600,
        reminder: 'on',
        baselineDays: 30,
        wearPercent: 0,
        sessionsLeft: 5,
      },
      battery: { percent: 80 },
      handle: {
        firmware: '82',
        oralb: {
          protocol: 8,
          modelId: 0x36,
          ringColour: 'yellow',
          modeSlots: [
            'smart_adapt',
            'daily_clean',
            'sensitive',
            'whiten',
            'gum_care',
            'intense',
            'tongue_clean',
          ],
          pacer: [30, 30, 30, 30, 0, 0, 0, 0],
        },
      },
      mayConfigure: true,
    });
    expect(state.view === 'state' && state.availableModes).toHaveLength(9);
  });

  it('builds the head timeline from the resets in the days-left series', async () => {
    const brushed = (rig = await oralbRig());
    const timeline = read(brushed, 'owner', { view: 'head' });
    expect(
      timeline.view === 'head' &&
        timeline.timeline.map((row) => [row.usageS / 86_400, row.current]),
    ).toEqual([
      [10, false],
      [10, true],
    ]);
  });

  it('gives the owner the diagnostics with the probes, the bands and the last raw records', async () => {
    const brushed = (rig = await oralbRig({
      oralb: { forceBands: { lightBelow: 0.6, highAbove: 3, samples: 2 } },
    }));
    wake(brushed);
    brushed.batch(1, {
      phase: 'linked',
      frames: [brushed.frame('ff29', '00'.repeat(21), 1)],
    });
    const view = read(brushed, 'owner', { view: 'diagnostics' });
    expect(view).toMatchObject({
      brand: {
        brand: 'oralb',
        forceBands: { samples: 2 },
        filterRegistered: true,
        identity: { protocol: 8 },
      },
    });
    expect(
      view.view === 'diagnostics' && view.brand.brand === 'oralb' && view.brand.records,
    ).toHaveLength(1);
  });

  it('keeps the diagnostics and the settings block from a member', async () => {
    const brushed = (rig = await oralbRig());
    expect(() => read(brushed, 'member', { view: 'diagnostics' })).toThrow(ApiError);
    const settings = read(brushed, 'member', { view: 'settings' });
    expect(settings).toMatchObject({ settings: null, mayConfigure: false });
  });

  it('shows the live force and the face only to the person who brushes', async () => {
    const brushed = (rig = await oralbRig({ owns: 'owner' }));
    brushed.batch(0, {
      phase: 'linked',
      frames: [brushed.frame('ff04', bytes(3, 0), 0), brushed.frame('ff08', bytes(0, 4), 0)],
    });
    brushed.batch(1, {
      phase: 'linked',
      frames: [brushed.frame('ff0b', pressureHex(2, 3200), 1), brushed.frame('ff0a', bytes(7), 1)],
    });
    const owner = read(brushed, 'owner', { view: 'state' });
    const kid = read(brushed, 'member', { view: 'state' });
    expect(owner.view === 'state' && owner.frame).toMatchObject({
      force: 3.2,
      face: 7,
      pressure: 'too_high',
      liveSource: 'link',
    });
    expect(kid.view === 'state' && kid.frame).toMatchObject({
      force: null,
      face: null,
      angleDeg: null,
      pressure: null,
    });
    expect(kid.view === 'state' && kid.mine).toBe(false);
  });

  it('reads every other page with the shared shapes', async () => {
    const brushed = (rig = await oralbRig());
    wake(brushed);
    for (const query of [
      { view: 'sessions' },
      { view: 'stats' },
      { view: 'battery' },
      { view: 'handle' },
    ] as const) {
      expect(read(brushed, 'owner', query).view).toBe(query.view);
    }
  });
});
