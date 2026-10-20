import { describe, expect, it } from 'vitest';
import {
  PRINTER_SUPPLY_SLOTS,
  SLOT_COLOURS,
  TANK_BODY,
  TANK_EDGE_CONTRAST,
  contrastBetween,
  luminanceOf,
  slotCode,
  slotKeys,
  slotLabel,
  slotOf,
  supplyCapabilityKey,
  tankEdge,
  type PrinterSupplySlot,
} from '../src';

describe('printer supply slots', () => {
  it('maps colorants to their own slot and unknown colorants by kind', () => {
    expect(slotOf({ colorant: 'cyan', kind: 'ink' })).toBe('cyan');
    expect(slotOf({ colorant: 'light-magenta', kind: 'toner' })).toBe('light-magenta');
    expect(slotOf({ colorant: null, kind: 'ink' })).toBe('multi-color');
    expect(slotOf({ colorant: null, kind: 'toner' })).toBe('black');
    expect(slotOf({ colorant: 'chartreuse', kind: 'ink' })).toBe('multi-color');
    expect(slotOf({ colorant: 'black', kind: 'waste' })).toBe('waste');
    expect(slotOf({ colorant: null, kind: 'drum' })).toBe('drum');
    expect(slotOf({ colorant: null, kind: 'other' })).toBe('other');
  });

  it('labels and codes every slot, with a colour for each', () => {
    for (const slot of PRINTER_SUPPLY_SLOTS) {
      expect(slotLabel(slot).length).toBeGreaterThan(0);
      expect(slotCode(slot).length).toBeGreaterThan(0);
      expect(SLOT_COLOURS[slot]).toMatch(/^#[0-9a-f]{6}$/u);
    }
    expect(slotLabel('light-cyan')).toBe('Light cyan');
    expect(slotCode('light-magenta')).toBe('LM');
    expect(supplyCapabilityKey('black-2')).toBe('raw:printer.supply.black-2');
  });

  it('numbers duplicates in order and keeps remembered keys when a cartridge goes missing', () => {
    const slots: readonly PrinterSupplySlot[] = ['black', 'cyan', 'black'];
    const first = slotKeys(slots, []);
    expect(first).toEqual(['black', 'cyan', 'black-2']);
    expect(slotKeys(['cyan', 'black'], first)).toEqual(['cyan', 'black']);
    expect(slotKeys(['black', 'cyan'], ['black-2', 'cyan', 'black'])).toEqual(['black-2', 'cyan']);
    expect(slotKeys(['black', 'black', 'black'], ['black', 'black-2'])).toEqual([
      'black',
      'black-2',
      'black-3',
    ]);
    expect(slotKeys(['light-cyan', 'light-cyan'], [])).toEqual(['light-cyan', 'light-cyan-2']);
  });
});

describe('tank colours stay visible against the empty tank', () => {
  const themes = ['light', 'dark'] as const;

  it.each(themes.flatMap((theme) => PRINTER_SUPPLY_SLOTS.map((slot) => [theme, slot] as const)))(
    'draws the edge of %s theme %s ink at 3:1 or better',
    (theme, slot) => {
      const edge = tankEdge(SLOT_COLOURS[slot], theme);
      expect(contrastBetween(edge, TANK_BODY[theme])).toBeGreaterThanOrEqual(TANK_EDGE_CONTRAST);
    },
  );

  it('leaves colours that already contrast alone and lightens black on dark', () => {
    expect(tankEdge('#000000', 'light')).toBe('#000000');
    expect(tankEdge('#000000', 'dark')).toBe('#000000');
    expect(tankEdge('#404040', 'dark')).not.toBe('#404040');
    expect(tankEdge('#ffff00', 'light')).not.toBe('#ffff00');
  });

  it('measures contrast with the WCAG formula', () => {
    expect(contrastBetween('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastBetween('#ffffff', '#ffffff')).toBe(1);
    expect(luminanceOf('#ffffff')).toBeCloseTo(1, 5);
    expect(luminanceOf('#000000')).toBe(0);
  });

  it('falls back to the extreme when no step reaches the ratio', () => {
    expect(tankEdge('#e4e7ec', 'light')).toMatch(/^#[0-9a-f]{6}$/u);
    expect(tankEdge('#5d667b', 'dark')).toMatch(/^#[0-9a-f]{6}$/u);
  });
});
