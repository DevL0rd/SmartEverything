import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInActionBand } from '../../../components/widget-board/band-context';
import { deviceFixture } from '../../../store/device-fixture';
import { LightCard, LightHeroCard, LightPanel, LightTile, LightWide } from './light-cards';

interface Seen {
  readonly name: string;
  readonly inBand: boolean;
  readonly detail: string | number | undefined;
}

interface Shown {
  parts: Seen[];
  light: {
    online: boolean;
    brightness: boolean;
    temperature: boolean;
    colour: boolean;
  };
}

const seen = vi.hoisted((): Shown => ({
  parts: [],
  light: {
    online: true,
    brightness: true,
    temperature: true,
    colour: true,
  },
}));

function useRecord(name: string, detail?: string | number, shown = true): null {
  const inBand = useInActionBand();
  if (shown) {
    seen.parts.push({ name, inBand, detail });
  }
  return null;
}

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));

vi.mock('./use-light', async () => {
  const { deviceFixture: fixture } = await import('../../../store/device-fixture');
  const part = (key: string): { readonly key: string } => ({ key });
  return {
    useLight: (): Record<string, unknown> => ({
      device: fixture(1),
      model: {},
      name: 'Desk lamp',
      colour: seen.light.colour ? '#ff8800' : null,
      failed: false,
      waiting: false,
      parts: {
        brightness: seen.light.brightness ? part('brightness') : null,
        temperature: seen.light.temperature ? part('colour_temperature') : null,
        colour: seen.light.colour ? part('colour') : null,
      },
      state: {
        online: seen.light.online,
        power: 'on',
        mode: 'white',
        kelvin: 2700,
        level: 60,
      },
    }),
  };
});

vi.mock('../card/stage', () => ({
  Visual: ({ size, px }: { readonly size: string; readonly px?: number }): null =>
    useRecord(`visual-${size}`, px),
}));
vi.mock('../controls/colour-shortcut', () => ({
  ColourSheetDot: (): null => useRecord('dot', undefined, seen.light.colour),
}));
vi.mock('../controls/power-toggle', () => ({
  PowerToggle: (): null => useRecord('power'),
}));
vi.mock('./level-control', () => ({
  LevelControl: ({
    shape,
    className,
  }: {
    readonly shape: string;
    readonly className?: string;
  }): null => useRecord('dimmer', `${shape} ${className ?? 'own height'}`),
}));
vi.mock('./light-colour-strip', () => ({
  LightColourStrip: ({ density }: { readonly density: string }): null =>
    useRecord('strip', density, seen.light.online && (seen.light.colour || seen.light.temperature)),
}));
vi.mock('./white-control', () => ({
  WhiteControl: ({ className }: { readonly className?: string }): null =>
    useRecord('white', className),
}));
vi.mock('./light-parts', () => ({
  LightNames: (): null => useRecord('names'),
  OfflineReason: (): null => useRecord('reason'),
}));
vi.mock('../../../components/status-chip', () => ({
  StatusChip: (): null => useRecord('offline-chip'),
}));
vi.mock('../../../components/level-surface', () => ({
  LevelLabel: (): null => null,
}));

let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
  seen.parts = [];
  seen.light = { online: true, brightness: true, temperature: true, colour: true };
});

const FACES = {
  tile: LightTile,
  m: LightCard,
  w: LightWide,
  l: LightPanel,
  xl: LightHeroCard,
} as const;

function show(face: keyof typeof FACES): readonly Seen[] {
  act(() => {
    root.render(createElement(FACES[face], { device: deviceFixture(1) }));
  });
  return seen.parts;
}

function names(parts: readonly Seen[], inBand: boolean): readonly string[] {
  return [...new Set(parts.filter((part) => part.inBand === inBand).map((part) => part.name))];
}

describe('light cards', () => {
  it.each([
    { face: 'm', px: 96 },
    { face: 'w', px: 96 },
    { face: 'l', px: 128 },
    { face: 'xl', px: 128 },
  ] as const)('shows one left art square of $px px at $face', ({ face, px }) => {
    const visuals = show(face).filter((part) => part.name.startsWith('visual'));
    expect(new Set(visuals.map((part) => `${part.name}:${String(part.detail)}`))).toEqual(
      new Set([`visual-card:${String(px)}`]),
    );
  });

  it.each([
    { face: 'tile', band: ['dot', 'power'], lane: ['names', 'dimmer'] },
    { face: 'm', band: ['strip', 'power'], lane: ['names', 'dimmer'] },
    { face: 'w', band: ['strip', 'power'], lane: ['names', 'dimmer', 'white'] },
    { face: 'l', band: ['power'], lane: ['names', 'dimmer', 'white', 'strip'] },
    { face: 'xl', band: ['power'], lane: ['names', 'dimmer', 'white', 'strip'] },
  ] as const)(
    'keeps buttons in the band and sliders in the lane at $face',
    ({ face, band, lane }) => {
      const parts = show(face);
      expect(names(parts, true)).toEqual(band);
      expect(names(parts, false).filter((name) => !name.startsWith('visual'))).toEqual(lane);
    },
  );

  it.each(['tile', 'm', 'w', 'l', 'xl'] as const)(
    'drops power, colour and sliders and shows the offline chip when offline at %s',
    (face) => {
      seen.light = { ...seen.light, online: false };
      const parts = show(face).map((part) => part.name);
      expect(parts).toContain('offline-chip');
      for (const gone of ['power', 'dot', 'dimmer', 'white', 'strip']) {
        expect(parts).not.toContain(gone);
      }
    },
  );

  it.each(['w', 'l', 'xl'] as const)('explains why the light is offline at %s', (face) => {
    seen.light = { ...seen.light, online: false };
    expect(show(face).map((part) => part.name)).toContain('reason');
  });

  it.each(['tile', 'm', 'w', 'l', 'xl'] as const)(
    'keeps power in the band for a plain on and off light at %s',
    (face) => {
      seen.light = { online: true, brightness: false, temperature: false, colour: false };
      const parts = show(face);
      expect(names(parts, true)).toEqual(['power']);
      expect(parts.map((part) => part.name)).not.toContain('dimmer');
      expect(parts.map((part) => part.name)).not.toContain('strip');
    },
  );

  it.each(['m', 'w', 'l', 'xl'] as const)(
    'sizes the bar dimmer to the control height at %s',
    (face) => {
      expect(show(face).find((part) => part.name === 'dimmer')?.detail).toBe('bar h-control-h');
    },
  );

  it.each(['w', 'l', 'xl'] as const)(
    'sizes the white slider to the control height at %s',
    (face) => {
      expect(show(face).find((part) => part.name === 'white')?.detail).toBe('h-control-h');
    },
  );

  it('keeps the slim dimmer at its own height on the tile', () => {
    expect(show('tile').find((part) => part.name === 'dimmer')?.detail).toBe('slim own height');
  });

  it.each(['m', 'w'] as const)('keeps the compact colour presets beside power at %s', (face) => {
    const strip = show(face).find((part) => part.name === 'strip');
    expect(strip).toEqual({ name: 'strip', inBand: true, detail: 'compact' });
  });

  it.each(['l', 'xl'] as const)('shows the full colour presets in the lane at %s', (face) => {
    const strip = show(face).find((part) => part.name === 'strip');
    expect(strip).toEqual({ name: 'strip', inBand: false, detail: 'full' });
  });

  it('keeps the white slider when a light has no brightness at w', () => {
    seen.light = { ...seen.light, brightness: false };
    const lane = names(show('w'), false);
    expect(lane).toContain('white');
    expect(lane).not.toContain('dimmer');
  });
});
