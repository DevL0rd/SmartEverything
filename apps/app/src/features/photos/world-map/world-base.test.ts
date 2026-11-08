import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('react-native-svg', () => ({ default: stub('Svg'), G: stub('G'), Path: stub('Path') }));
vi.mock('../../../design/colour', () => ({
  useColour: (role: string): string => `#${role}`,
}));
vi.mock('../../../design/use-visible-live', () => ({ useVisibleLive: vi.fn() }));

const { WorldBase } = await import('./world-base');
const { frameOf } = await import('./use-map-frame');
const { WORLD_VIEW } = await import('./projection');

function paths(): readonly Props[] {
  return seen.filter((entry) => entry.kind === 'Path').map((entry) => entry.props);
}

describe('world base', () => {
  it('draws one path per country in view with the frame size and view box', () => {
    seen.length = 0;
    renderToStaticMarkup(
      createElement(WorldBase, { view: WORLD_VIEW, frame: { width: 900, height: 355 } }),
    );
    const svg = seen.find((entry) => entry.kind === 'Svg')?.props;
    expect(svg?.['viewBox']).toBe('0 60 3600 1420');
    expect(svg?.['width']).toBe(900);
    expect(paths()).toHaveLength(176);
    expect(new Set(paths().map((path) => path['fill']))).toEqual(new Set(['#surface-3']));
    expect(new Set(paths().map((path) => path['stroke']))).toEqual(new Set(['#outline']));
    expect(paths().every((path) => path['fillOpacity'] === undefined)).toBe(true);
  });

  it('lays the first data colour at its shade over a visited country and leaves the rest as land', () => {
    seen.length = 0;
    renderToStaticMarkup(
      createElement(WorldBase, {
        view: WORLD_VIEW,
        frame: { width: 900, height: 355 },
        shades: new Map([['PT', 0.8]]),
      }),
    );
    const visited = paths().filter((path) => path['fill'] === '#viz-1');
    expect(visited).toHaveLength(1);
    expect(visited[0]?.['fillOpacity']).toBe(0.8);
    expect(visited[0]?.['stroke']).toBeUndefined();
    const land = paths().filter((path) => path['fill'] === '#surface-3');
    expect(land).toHaveLength(176);
    expect(land.some((path) => path['d'] === visited[0]?.['d'])).toBe(true);
  });

  it('draws only the countries near a mini map point', () => {
    seen.length = 0;
    renderToStaticMarkup(
      createElement(WorldBase, {
        view: { x: 1494, y: 369, width: 430, height: 287 },
        frame: { width: 300, height: 200 },
      }),
    );
    expect(paths().length).toBeGreaterThan(5);
    expect(paths().length).toBeLessThan(40);
  });
});

describe('map frame', () => {
  it('draws nothing until it is laid out and while it is not visible', () => {
    expect(frameOf(0, 0, true)).toBeNull();
    expect(frameOf(400, 300, false)).toBeNull();
    expect(frameOf(400, 300, true)).toEqual({ width: 400, height: 300 });
  });
});
