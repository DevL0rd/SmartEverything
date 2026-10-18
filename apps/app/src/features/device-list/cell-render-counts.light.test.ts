import { describe, expect, it, vi } from 'vitest';
import type { WidgetFrameBox } from '../../components/widget-board';
import { makeTable, type StoreState } from '../../store/state';
import { mountFace, useCellEnvironment, type Face, type Spec } from './cell-budget';

vi.mock('../../queries/use-screen-query', async () => (await import('./idle-queries')).idleQueries);

const POWER: Spec = ['power', { kind: 'boolean' }];
const BRIGHTNESS: Spec = ['brightness', { kind: 'number', min: 0, max: 100, step: 1, unit: '%' }];
const TEMPERATURE: Spec = [
  'color_temperature',
  { kind: 'number', min: 2200, max: 6500, step: 100, unit: 'K' },
];
const COLOUR: Spec = ['color', { kind: 'color' }];

const VALUES = { power: true, brightness: 60, color_temperature: 3000 } as const;

function offline(state: StoreState): StoreState {
  const byId = Object.fromEntries(
    Object.entries(state.tables.devices.byId).map(([id, row]) => [id, { ...row, online: false }]),
  );
  return {
    ...state,
    tables: {
      ...state.tables,
      devices: makeTable(byId, state.tables.devices.ids, state.tables.devices.version + 1),
    },
  };
}

function light(
  name: string,
  specs: readonly Spec[],
  seed?: (state: StoreState) => StoreState,
): Face {
  return {
    name,
    kind: 'light',
    specs,
    values: VALUES,
    shown: ['brightness', 30],
    ...(seed === undefined ? {} : { seed }),
  };
}

const COLOUR_BULB = light('colour bulb', [POWER, BRIGHTNESS, TEMPERATURE, COLOUR]);
const WHITE_BULB = light('white bulb', [POWER, BRIGHTNESS, TEMPERATURE]);
const DIMMER_ONLY = light('dimmer only', [POWER, BRIGHTNESS]);
const OFFLINE_BULB = light('offline bulb', [POWER, BRIGHTNESS, TEMPERATURE, COLOUR], offline);

const FRAMES: Readonly<Record<'xs' | 'm' | 'l' | 'w' | 'xl', WidgetFrameBox>> = {
  xs: { width: 508, height: 120, idiom: 'pointer' },
  m: { width: 326, height: 168, idiom: 'touch' },
  l: { width: 326, height: 324, idiom: 'touch' },
  w: { width: 1072, height: 120, idiom: 'pointer' },
  xl: { width: 1072, height: 296, idiom: 'pointer' },
};

function treeOf(face: Face, frame: keyof typeof FRAMES): string {
  const mounted = mountFace(face, FRAMES[frame]);
  const tree = mounted.tree();
  mounted.unmount();
  return tree;
}

function has(tree: string, label: string): boolean {
  return tree.includes(`accessibilityLabel="${label}"`);
}

describe('light faces in the widget cell', () => {
  useCellEnvironment();

  it('shows a dimmer and a colour dot on the wide tile, never a square', () => {
    const tree = treeOf(COLOUR_BULB, 'xs');
    expect(has(tree, 'Device 0 brightness')).toBe(true);
    expect(has(tree, 'Device 0 colour')).toBe(true);
    expect(has(tree, 'More colours')).toBe(false);
  });

  it('gives the card a dimmer and a colour strip that ends in More, without a white bar', () => {
    const tree = treeOf(COLOUR_BULB, 'm');
    expect(has(tree, 'Device 0 brightness')).toBe(true);
    expect(has(tree, 'Device 0 colour')).toBe(true);
    expect(has(tree, 'More colours')).toBe(true);
    expect(has(tree, 'Device 0 white temperature')).toBe(false);
  });

  it.each(['l', 'w', 'xl'] as const)(
    'gives the %s face a dimmer, a white bar and the colour strip',
    (frame) => {
      const tree = treeOf(COLOUR_BULB, frame);
      expect(has(tree, 'Device 0 brightness')).toBe(true);
      expect(has(tree, 'Device 0 white temperature')).toBe(true);
      expect(has(tree, 'Device 0 colour')).toBe(true);
      expect(has(tree, 'More colours')).toBe(true);
    },
  );

  it('offers white presets to a bulb that only has a temperature', () => {
    const tree = treeOf(WHITE_BULB, 'm');
    expect(has(tree, 'Warm 2700 K')).toBe(true);
    expect(has(tree, 'Amber')).toBe(false);
  });

  it('offers colour presets to a colour bulb', () => {
    const tree = treeOf(COLOUR_BULB, 'l');
    expect(has(tree, 'Amber')).toBe(true);
    expect(has(tree, 'Warm white')).toBe(true);
  });

  it.each(['xs', 'm', 'l', 'w', 'xl'] as const)(
    'shows no colour access and no text line for a dimmer-only bulb on %s',
    (frame) => {
      const tree = treeOf(DIMMER_ONLY, frame);
      expect(has(tree, 'Device 0 brightness')).toBe(true);
      expect(has(tree, 'More colours')).toBe(false);
      expect(has(tree, 'Device 0 colour')).toBe(false);
      expect(tree).not.toContain('White only');
    },
  );

  it.each(['xs', 'm', 'l', 'w', 'xl'] as const)(
    'disables every control of an offline bulb on %s',
    (frame) => {
      const tree = treeOf(OFFLINE_BULB, frame);
      expect(has(tree, 'Device 0 brightness')).toBe(false);
      expect(has(tree, 'More colours')).toBe(false);
      expect(has(tree, 'Device 0 white temperature')).toBe(false);
    },
  );
});
