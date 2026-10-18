import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { cellNodes as nodes, PALETTE, PaletteContext } from './cell-mocks';
import { useCellEnvironment } from './cell-budget';
import { treeOf } from './cell-tree';
import { ColourStrip } from '../../components/colour-strip';
import { LevelSurface } from '../../components/level-surface';
import { Slider } from '../../components/slider';
import { Text } from '../../components/text';

vi.mock('../../platform/haptics', () => ({ selectionTick: (): void => undefined }));

function mount(element: ReactNode): {
  readonly count: number;
  readonly tree: () => string;
  readonly unmount: () => void;
} {
  const container = {
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  };
  const root = createRoot(container);
  nodes.count = 0;
  act(() => {
    root.render(createElement(PaletteContext, { value: PALETTE }, element));
  });
  return {
    count: nodes.count,
    tree: (): string => treeOf(container),
    unmount: (): void => {
      act(() => {
        root.unmount();
      });
    },
  };
}

const noop = (): void => undefined;
const SWATCHES = ['amber', 'orange', 'teal'].map((id) => ({ id, label: id, colour: '#ffb16e' }));

function subtreeOf(tree: string, marker: string): readonly string[] {
  const lines = tree.split('\n');
  const start = lines.findIndex((line) => line.includes(marker));
  const indent = (line: string): number => line.length - line.trimStart().length;
  const base = indent(lines[start] ?? '');
  const end = lines.findIndex((line, at) => at > start && indent(line) <= base);
  return lines.slice(start, end === -1 ? undefined : end);
}

describe('level surface track range', () => {
  useCellEnvironment();

  it('keeps the thumb and fill inside the area before the trailing controls', () => {
    const view = mount(
      createElement(LevelSurface, {
        value: 100,
        shape: 'row',
        label: 'Row',
        onChange: noop,
        trailing: createElement(Text, { className: 'trailing-controls' }, 'Open'),
      }),
    );
    const tree = view.tree();
    const region = subtreeOf(tree, 'flex-1 flex-row');
    expect(region.some((line) => line.includes('w-4.5'))).toBe(true);
    expect(region.some((line) => line.includes('trailing-controls'))).toBe(false);
    expect(tree).toContain('trailing-controls');
    view.unmount();
  });

  it('has no extra region when nothing trails the track', () => {
    const view = mount(
      createElement(LevelSurface, { value: 100, shape: 'row', label: 'Row', onChange: noop }),
    );
    expect(view.tree()).not.toContain('flex-1 flex-row');
    view.unmount();
  });
});

describe('kit control render counts', () => {
  useCellEnvironment();

  it('draws a lit dimmer bar in at most 8 nodes', () => {
    const view = mount(
      createElement(LevelSurface, {
        value: 60,
        label: 'Brightness',
        tint: '#ffb16e',
        onChange: noop,
      }),
    );
    expect(view.count).toBeLessThanOrEqual(8);
    view.unmount();
  });

  it('draws a white bar with its thumb in at most 14 nodes', () => {
    const view = mount(
      createElement(LevelSurface, {
        value: 3000,
        variant: 'white',
        shape: 'slim',
        label: 'White',
        onChange: noop,
      }),
    );
    expect(view.count).toBeLessThanOrEqual(14);
    view.unmount();
  });

  it('adds no thumb node to an off row and one to an off bar', () => {
    const row = mount(
      createElement(LevelSurface, { value: null, shape: 'row', label: 'R', onChange: noop }),
    );
    const bar = mount(
      createElement(LevelSurface, { value: null, shape: 'bar', label: 'B', onChange: noop }),
    );
    expect(bar.count - row.count).toBe(1);
    row.unmount();
    bar.unmount();
  });

  it('draws the slider track, fill and thumb in at most 5 nodes', () => {
    const view = mount(
      createElement(Slider, {
        value: 40,
        min: 0,
        max: 100,
        step: 1,
        label: 'Speed',
        onCommit: noop,
      }),
    );
    expect(view.count).toBeLessThanOrEqual(5);
    view.unmount();
  });

  it('does not render again on its own once drawn', () => {
    const view = mount(
      createElement(ColourStrip, {
        label: 'Colour',
        swatches: SWATCHES,
        selectedId: 'amber',
        onPick: noop,
        onMore: noop,
      }),
    );
    nodes.count = 0;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(nodes.count).toBe(0);
    view.unmount();
  });
});
