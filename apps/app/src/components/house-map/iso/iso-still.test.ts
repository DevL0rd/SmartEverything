import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PlanSymbolOf } from '../plan/symbols';
import { isoHouse, isoObject } from './iso-fixture';
import type { IsoStillInput } from './model';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View') }));
vi.mock('react-native-svg', () => ({
  default: stub('Svg'),
  Path: stub('Path'),
  G: stub('G'),
  Defs: stub('Defs'),
  ClipPath: stub('ClipPath'),
  RadialGradient: stub('RadialGradient'),
  Stop: stub('Stop'),
}));
vi.mock('uniwind', () => ({ useUniwind: (): { theme: string } => ({ theme: 'light' }) }));
vi.mock('../../../design/colour', () => ({
  useColourResolver: (): ((role: string) => string) => (role) => `#${role}`,
}));

const { IsoStill, IsoStillCanvas } = await import('./iso-still');
const { buildIsoStill } = await import('./model');

const symbolOf: PlanSymbolOf = (item) =>
  item.modelId === 'cat.living.sofa'
    ? {
        layers: [
          {
            d: 'M-0.5 -0.3h1v0.6h-1z',
            fill: '#a0a0a0',
            fillOpacity: 1,
            fillRule: 'nonzero',
            stroke: '#505050',
          },
        ],
      }
    : null;

const base: IsoStillInput = { floor: isoHouse(), look: { symbolOf } };

function render(input: IsoStillInput): readonly { readonly kind: string; readonly props: Props }[] {
  seen.length = 0;
  renderToStaticMarkup(createElement(IsoStillCanvas, { input, width: 400, height: 240 }));
  return [...seen];
}

const viewport = { width: 400, height: 240 };

describe('buildIsoStill', () => {
  it('paints furniture over the back walls and under the cut front walls', () => {
    const floor = isoHouse();
    const corner = isoObject('corner', 7.4, 3.6, null);
    const model = buildIsoStill(
      { ...base, floor: { ...floor, objects: [...floor.objects, corner] } },
      viewport,
    );
    const ids = model.solids.map((solid) => solid.id);
    const at = (id: string): number => ids.indexOf(id);
    for (const wall of ['wall:east:0', 'wall:north:0']) {
      expect(at(wall)).toBeGreaterThanOrEqual(0);
      expect(at('object:corner')).toBeGreaterThan(at(wall));
      expect(at('object:sofa')).toBeGreaterThan(at(wall));
    }
    for (const wall of ['wall:south:0', 'wall:west:0']) {
      expect(at('object:sofa')).toBeLessThan(at(wall));
      expect(at('object:corner')).toBeLessThan(at(wall));
    }
  });

  it('draws walls, objects, devices and the robot', () => {
    const model = buildIsoStill(base, viewport);
    const kinds = new Set(model.solids.map((solid) => solid.kind));
    expect([...kinds].sort()).toEqual(['device', 'exterior', 'object', 'robot']);
  });

  it('draws the plan symbol on top of a known model and a labelled box for an unknown one', () => {
    const model = buildIsoStill(base, viewport);
    const sofa = model.solids.find((solid) => solid.id === 'object:sofa');
    const unknown = model.solids.find((solid) => solid.id === 'object:far');
    expect(sofa?.mark?.symbol).toHaveLength(1);
    expect(sofa?.mark?.glyph).toBeNull();
    expect(unknown?.mark?.symbol).toBeNull();
    expect(unknown?.mark?.glyph).toMatch(/^M/u);
  });

  it('shades objects with their finish colour', () => {
    const model = buildIsoStill({ ...base, look: { finishOf: () => '#c08f5c' } }, viewport);
    const sofa = model.solids.find((solid) => solid.id === 'object:sofa');
    expect(sofa?.finish).toBe('#c08f5c');
  });

  it('merges the pools of lit lights per room and clips them to the room', () => {
    const none = buildIsoStill(base, viewport);
    expect(none.pools).toEqual([]);
    const lit = buildIsoStill({ ...base, litDeviceIds: ['lamp-a', 'lamp-b'] }, viewport);
    expect(lit.pools.map((group) => group.roomId)).toEqual(['a', 'b']);
    expect(
      lit.pools.every(
        (group) => group.clip === lit.rooms.find((room) => room.id === group.roomId)?.d,
      ),
    ).toBe(true);
    const pool = lit.pools[0]?.pools[0];
    expect(pool?.ry).toBeLessThan(pool?.rx ?? 0);
  });

  it('draws the last robot pose unless the host says there is none', () => {
    expect(buildIsoStill(base, viewport).solids.some((solid) => solid.kind === 'robot')).toBe(true);
    const gone = buildIsoStill({ ...base, robot: null }, viewport);
    expect(gone.solids.some((solid) => solid.kind === 'robot')).toBe(false);
  });

  it('marks occupied rooms and zone fills', () => {
    const model = buildIsoStill(
      {
        ...base,
        activeRoomIds: ['b'],
        zones: [
          {
            id: 'z',
            deviceId: 'shelly',
            occupied: true,
            polygons: [
              {
                outer: [
                  { x: 5, y: 1 },
                  { x: 6, y: 1 },
                  { x: 6, y: 2 },
                ],
                holes: [],
              },
            ],
          },
        ],
      },
      viewport,
    );
    expect(model.rooms.map((room) => room.active)).toEqual([false, true]);
    expect(model.zones).toHaveLength(1);
    expect(model.zones[0]?.occupied).toBe(true);
    expect(model.zones[0]?.d).toMatch(/Z$/u);
  });
});

describe('IsoStillCanvas', () => {
  it('renders floors, occupancy, pools and solids in painter order', () => {
    const drawn = render({ ...base, litDeviceIds: ['lamp-a'], activeRoomIds: ['a'] });
    const fills = drawn
      .filter((entry) => entry.kind === 'Path')
      .map((entry) => entry.props['fill']);
    expect(fills.filter((fill) => fill === '#viz-1').length).toBe(2);
    expect(fills.filter((fill) => fill === '#primary').length).toBeGreaterThan(0);
    expect(drawn.filter((entry) => entry.kind === 'ClipPath')).toHaveLength(1);
    expect(fills.indexOf('#viz-1')).toBeLessThan(fills.indexOf('#a0a0a0'));
    expect(
      drawn.some((entry) => entry.kind === 'G' && typeof entry.props['clipPath'] === 'string'),
    ).toBe(true);
  });

  it('paints rooms and solids from the theme roles', () => {
    const drawn = render(base).filter((entry) => entry.kind === 'Path');
    const strokes = new Set(drawn.map((entry) => entry.props['stroke']));
    const fills = new Set(drawn.map((entry) => entry.props['fill']));
    expect(strokes).toContain('#outline-variant');
    expect(strokes).toContain('#outline');
    expect(strokes).toContain('#primary');
    expect(fills).toContain('#surface-3');
    expect(fills).toContain('#surface-raised');
  });

  it('draws no pool layer when every light is off', () => {
    const drawn = render(base);
    expect(drawn.some((entry) => entry.kind === 'RadialGradient')).toBe(false);
  });
});

describe('IsoStill', () => {
  it('describes the map for screen readers before it has a size', () => {
    seen.length = 0;
    renderToStaticMarkup(createElement(IsoStill, { input: base, name: 'Home' }));
    const view = seen.find((entry) => entry.kind === 'View');
    expect(view?.props['accessibilityLabel']).toMatch(/^Map of Home, 2 rooms/u);
    expect(seen.some((entry) => entry.kind === 'Svg')).toBe(false);
  });
});
