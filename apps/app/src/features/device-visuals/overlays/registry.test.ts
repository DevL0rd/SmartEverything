import { describe, expect, it } from 'vitest';
import { sample } from '../model/signals-of-fixtures';
import { Haze } from '../parts/haze';
import { Dots, Puffs } from '../parts/particles';
import { Water } from '../parts/water';
import {
  EFFECT_LOOKS,
  EFFECT_PARTS,
  EFFECT_PART_NAMES,
  SCREEN_PART_NAMES,
  effectRuns,
  overlayPlans,
  screenPartOf,
  unitBox,
} from './registry';
import {
  IO_GLASS,
  LAUNDRY_FACE,
  PRINTER_PANEL,
  SCREEN_PARTS,
  cropOf,
  phoneRegion,
} from './screen-overlay';

const { fanSpec } = await import('../../models/visual/visual-fixture');

const SPEC = fanSpec();

const READING = { text: '21.5', unit: '°C', at: '2026-10-25T08:00:00Z' };

const ANCHORS = [
  { id: 'display', kind: 'screen', rect: { x: 24, y: 48, width: 48, height: 12 } },
  { id: 'mist', kind: 'effect', rect: { x: 40, y: 8, width: 16, height: 16 } },
  { id: 'pin', kind: 'label', rect: { x: 0, y: 0, width: 0, height: 0 } },
] as const;

describe('overlay registry', () => {
  it('binds a screen anchor to the readout when the state carries a reading', () => {
    expect(screenPartOf(sample({ reading: READING }))).toBe('readout');
    expect(screenPartOf(sample({}))).toBeNull();
  });

  it('plans the screen and effect anchors at their projected rectangles and skips the rest', () => {
    const plans = overlayPlans(SPEC, ANCHORS, sample({ reading: READING }));
    expect(plans).toEqual([
      { kind: 'screen', id: 'display', part: 'readout', rect: ANCHORS[0].rect },
      {
        kind: 'effect',
        id: 'mist',
        effect: 'mist',
        look: EFFECT_LOOKS.mist,
        rect: ANCHORS[1].rect,
      },
    ]);
  });

  it('drops a screen anchor when the state has nothing to show on it', () => {
    expect(overlayPlans(SPEC, ANCHORS, sample({})).map((plan) => plan.kind)).toEqual(['effect']);
  });

  it('maps every effect to one of the existing effect parts', () => {
    expect(EFFECT_LOOKS.water.part).toBe('water');
    expect(EFFECT_LOOKS.airflow.part).toBe('haze');
    expect(EFFECT_LOOKS.sparkle.part).toBe('dots');
    expect(EFFECT_LOOKS.steam.part).toBe('puffs');
  });

  it('turns a pixel rectangle of the bake into the 0 to 100 units the parts draw in', () => {
    expect(unitBox({ x: 24, y: 48, width: 48, height: 12 }, 96)).toEqual({
      x: 25,
      y: 50,
      w: 50,
      h: 12.5,
    });
  });

  it('runs looping effects only while the model moves and the device is on and online', () => {
    const on = {
      state: sample({}),
      size: 'card',
      tone: 'active',
      moving: true,
      reduced: false,
    } as const;
    expect(effectRuns(on)).toBe(true);
    expect(effectRuns({ ...on, moving: false })).toBe(false);
    expect(effectRuns({ ...on, state: sample({ power: 'off' }) })).toBe(false);
    expect(effectRuns({ ...on, state: sample({ online: false }) })).toBe(false);
  });

  it('binds every screen part to a renderer with a face', () => {
    expect(Object.keys(SCREEN_PARTS).sort()).toEqual([...SCREEN_PART_NAMES].sort());
    for (const name of SCREEN_PART_NAMES) {
      expect(typeof SCREEN_PARTS[name].Face).toBe('function');
      expect(typeof SCREEN_PARTS[name].region).toBe('function');
    }
  });

  it('frames the drawn displays by their own regions and crops the rest', () => {
    const state = sample({});
    expect(SCREEN_PARTS.io.region(state)).toEqual(IO_GLASS);
    expect(SCREEN_PARTS.printer.region(state)).toEqual(PRINTER_PANEL);
    expect(SCREEN_PARTS.phone.region(state)).toEqual(phoneRegion(state));
    expect(phoneRegion(state).w).toBeGreaterThan(0);
    for (const name of ['readout', 'microwave', 'treadmill', 'laundry'] as const) {
      expect(SCREEN_PARTS[name].region(state)).toBeNull();
    }
  });

  it('scales and shifts a cropped visual so its display fills the anchor', () => {
    const crop = cropOf({ x: 0, y: 0, w: 50, h: 50 }, LAUNDRY_FACE, 96);
    expect(crop.px).toBeCloseTo((48 / 44) * 100);
    expect(crop.left).toBeCloseTo(-(28 * crop.px) / 100);
    expect(crop.top).toBeCloseTo(-(35 * crop.px) / 100);
  });

  it('binds every effect part to the existing device-visuals part', () => {
    expect(Object.keys(EFFECT_PARTS).sort()).toEqual([...EFFECT_PART_NAMES].sort());
    expect(EFFECT_PARTS).toEqual({ puffs: Puffs, dots: Dots, haze: Haze, water: Water });
    for (const look of Object.values(EFFECT_LOOKS)) {
      expect(EFFECT_PARTS[look.part]).toBeDefined();
    }
  });
});
