import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAMERA_INSPECTOR_WIDTH,
  playerSlot,
  viewerClasses,
  viewerLayoutFor,
  viewerUsesFullWidth,
} from './viewer-layout';

describe('player slot across navigation widths', () => {
  it('keeps the phone player in flow and aligns the wide player to its measured slot', () => {
    const phone = { height: 850, headerHeight: 0, gap: 20, gutter: 16, width: 0, full: false };
    expect(playerSlot({ ...phone, compact: true })).toEqual({
      position: undefined,
      fitted: undefined,
    });
    const rail = { ...phone, gutter: 24, width: 772 };
    expect(playerSlot({ ...rail, compact: false })).toEqual({
      position: { left: 24, top: 20, width: 772 },
      fitted: undefined,
    });
    expect(playerSlot({ ...rail, compact: true }).position).toBeUndefined();
  });

  it('leaves room for the measured header above an ultrawide player', () => {
    const slot = playerSlot({
      height: 1080,
      headerHeight: 68,
      gap: 24,
      gutter: 40,
      width: 1756,
      full: true,
      compact: false,
    });
    expect(slot.position).toEqual({ left: 40, top: 92, width: 1756 });
    expect(slot.fitted?.maxWidth).toBeCloseTo(1756.444);
  });
});

describe('viewerClasses', () => {
  it('keeps one slot per region in every layout so only styles change', () => {
    const keys = Object.keys(viewerClasses({ wide: false, columns: false })).sort();
    expect(Object.keys(viewerClasses({ wide: true, columns: true })).sort()).toEqual(keys);
    expect(Object.keys(viewerClasses({ wide: false, columns: true })).sort()).toEqual(keys);
  });

  it('puts the inspector beside the player only when wide', () => {
    expect(viewerClasses({ wide: true, columns: true }).row).toContain('flex-row');
    expect(viewerClasses({ wide: false, columns: true }).row).not.toContain('flex-row');
    expect(viewerClasses({ wide: true, columns: true }).width).toBe('dashboard');
    expect(viewerClasses({ wide: false, columns: false }).width).toBe('detail');
  });

  it('splits panels and recent into columns only at the expanded width', () => {
    expect(viewerClasses({ wide: false, columns: true }).side).toContain('flex-row');
    expect(viewerClasses({ wide: false, columns: false }).side).not.toContain('flex-row');
  });
});

describe('viewerLayoutFor', () => {
  it('keeps the docked inspector width in sync with its style token', () => {
    const css = readFileSync(new URL('../../../../global.css', import.meta.url), 'utf8');
    expect(css).toContain(`--spacing-inspector: ${String(CAMERA_INSPECTOR_WIDTH)}px;`);
  });

  it('splits supporting panels only if both measured columns fit with their gap', () => {
    expect(viewerLayoutFor(623, 24)).toEqual({ wide: false, columns: false });
    expect(viewerLayoutFor(624, 24)).toEqual({ wide: false, columns: true });
    expect(viewerLayoutFor(616, 16)).toEqual({ wide: false, columns: true });
  });

  it('uses the full page only with room for a detail player and both inspector columns', () => {
    expect(viewerUsesFullWidth(1447, 24)).toBe(false);
    expect(viewerUsesFullWidth(1448, 24)).toBe(true);
    expect(viewerClasses({ wide: true, columns: true }, true).width).toBe('full');
  });

  it('docks the inspector only with room for the detail pane and its gap', () => {
    expect(viewerLayoutFor(1003, 24)).toEqual({ wide: false, columns: true });
    expect(viewerLayoutFor(1004, 24)).toEqual({ wide: true, columns: true });
    expect(viewerLayoutFor(1000, 20)).toEqual({ wide: true, columns: true });
  });
});
