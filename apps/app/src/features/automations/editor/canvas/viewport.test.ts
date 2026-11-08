import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { automation, start } from '../../model/graph/graph-scene-fixtures';
import { babyProgram } from '../../model/graph/graph-baby-fixture';
import { projectGraphScene } from '../../model/graph/project-graph-scene';
import type { GraphFlowNode } from './graph-canvas-types';
import { measuredSizes } from './measure';
import { buildGraphNodes } from './scene-to-flow';
import {
  EMPTY_SIDE,
  FIT_MAX_ZOOM,
  FIT_OPTIONS,
  FIT_PADDING,
  OPENING_MARGIN,
  OPENING_ZOOM,
  WHOLE_PADDING,
  ZOOM_LIMITS,
  fitViewport,
  framedViewport,
  isEmptyScene,
  openingViewport,
  sceneBounds,
  wholeHeight,
  wholeViewport,
} from './viewport';

const baby = projectGraphScene(babyProgram(), {
  direction: 'ltr',
  kinds: STATIC_KIND_LOOKUP,
  density: 'touch',
});

function nodeOf(family: string): (typeof baby.nodes)[number] {
  const found = baby.nodes.find((node) => node.family === family);
  if (found === undefined) throw new Error(`no ${family} card`);
  return found;
}

describe('opening view', () => {
  it('opens touch at zoom 1 so exec rows are 48 px on screen, and pointer at 0.85', () => {
    expect(OPENING_ZOOM.touch).toBe(1);
    expect(openingViewport(baby, { width: 820, height: 1000 }, 'touch').zoom).toBe(1);
    expect(openingViewport(baby, { width: 1400, height: 800 }, 'pointer').zoom).toBe(0.85);
  });

  it('opens a phone at the trigger so the first screenful starts with it', () => {
    const view = openingViewport(baby, { width: 412, height: 800 }, 'touch');
    const trigger = nodeOf('trigger');
    expect(trigger.x * view.zoom + view.x).toBe(OPENING_MARGIN);
    const top = Math.min(...baby.nodes.map((node) => node.y * view.zoom + view.y));
    expect(top).toBeGreaterThanOrEqual(OPENING_MARGIN);
  });

  it('shows the trigger, Start and the first decision on desktop', () => {
    const view = openingViewport(baby, { width: 1400, height: 800 }, 'pointer');
    const trigger = nodeOf('trigger');
    const decision = nodeOf('decision');
    expect(trigger.x * view.zoom + view.x).toBe(OPENING_MARGIN);
    expect((decision.x + decision.w) * view.zoom + view.x).toBeLessThanOrEqual(1400);
    const top = Math.min(...baby.nodes.map((node) => node.y * view.zoom + view.y));
    expect(top).toBeGreaterThanOrEqual(OPENING_MARGIN);
  });

  it('centres an empty automation with room for both placeholders', () => {
    const empty = projectGraphScene(automation([start()], { triggers: [] }), {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
    });
    expect(isEmptyScene(empty)).toBe(true);
    const view = openingViewport(empty, { width: 1000, height: 600 }, 'pointer');
    const node = empty.nodes[0];
    if (node === undefined) throw new Error('no Start');
    const left = (node.x - EMPTY_SIDE) * view.zoom + view.x;
    const right = (node.x + node.w + EMPTY_SIDE) * view.zoom + view.x;
    expect(left).toBeCloseTo(1000 - right);
  });

  it('never fits past zoom 1', () => {
    expect(FIT_OPTIONS.maxZoom).toBe(FIT_MAX_ZOOM);
    expect(FIT_MAX_ZOOM).toBe(1);
    expect(FIT_OPTIONS.padding).toEqual({
      top: `${String(FIT_PADDING.top)}px`,
      left: `${String(FIT_PADDING.left)}px`,
      bottom: `${String(FIT_PADDING.bottom)}px`,
      right: `${String(FIT_PADDING.right)}px`,
    });
  });
});

describe('fit', () => {
  const left = Math.min(...baby.nodes.map((node) => node.x));
  const top = Math.min(...baby.nodes.map((node) => node.y));
  const graph = {
    x: left,
    y: top,
    width: Math.max(...baby.nodes.map((node) => node.x + node.w)) - left,
    height: Math.max(...baby.nodes.map((node) => node.y + node.h)) - top,
  };
  const first = nodeOf('start');
  const start = { x: first.x, y: first.y, width: first.w, height: first.h };

  it.each([
    { width: 412, height: 800 },
    { width: 820, height: 1100 },
    { width: 1440, height: 900 },
  ])('shows the whole graph at $width px', (frame) => {
    const view = fitViewport(graph, start, frame, FIT_PADDING);
    expect(graph.x * view.zoom + view.x).toBeGreaterThanOrEqual(0);
    expect((graph.x + graph.width) * view.zoom + view.x).toBeLessThanOrEqual(frame.width);
    expect(graph.y * view.zoom + view.y).toBeGreaterThanOrEqual(0);
    expect((graph.y + graph.height) * view.zoom + view.y).toBeLessThanOrEqual(frame.height);
    expect(view.zoom).toBeLessThanOrEqual(FIT_MAX_ZOOM);
  });

  it('fits the width and centres Start when the whole graph would be tinier than the canvas limit', () => {
    const tall = { ...graph, height: graph.height * 400 };
    const view = fitViewport(tall, start, { width: 1440, height: 900 }, FIT_PADDING);
    expect(view.zoom).toBeCloseTo((1440 - 144) / graph.width);
    expect(graph.x * view.zoom + view.x).toBeGreaterThanOrEqual(24);
    expect((graph.x + graph.width) * view.zoom + view.x).toBeLessThanOrEqual(1440 - 120 + 1e-6);
    const middle = (start.y + start.height / 2) * view.zoom + view.y;
    expect(middle).toBeCloseTo(24 + (900 - 144) / 2);
  });

  it('has no zoom floor when the width needs a smaller zoom', () => {
    const wide = { ...graph, width: graph.width * 400 };
    const view = fitViewport(wide, start, { width: 412, height: 800 }, FIT_PADDING);
    expect(view.zoom).toBeLessThan(ZOOM_LIMITS.min);
    expect(wide.x * view.zoom + view.x).toBeCloseTo(24);
  });
});

describe('whole framing', () => {
  const bounds = sceneBounds(baby.nodes);

  it('bounds every card of the scene', () => {
    if (bounds === null) throw new Error('no bounds');
    baby.nodes.forEach((node) => {
      expect(node.x).toBeGreaterThanOrEqual(bounds.x);
      expect(node.y).toBeGreaterThanOrEqual(bounds.y);
      expect(node.x + node.w).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(node.y + node.h).toBeLessThanOrEqual(bounds.y + bounds.height);
    });
    expect(sceneBounds([])).toBeNull();
  });

  it.each([348, 1100, 1600])(
    'fits the whole graph in a %d px wide panel and sizes its height to the graph',
    (width) => {
      if (bounds === null) throw new Error('no bounds');
      const height = wholeHeight(bounds, width, Number.POSITIVE_INFINITY);
      const view = framedViewport(baby, { width, height }, 'touch', 'whole');
      expect(view.zoom).toBeLessThanOrEqual(FIT_MAX_ZOOM);
      const left = bounds.x * view.zoom + view.x;
      const top = bounds.y * view.zoom + view.y;
      const bottom = (bounds.y + bounds.height) * view.zoom + view.y;
      const right = (bounds.x + bounds.width) * view.zoom + view.x;
      expect(left).toBeGreaterThanOrEqual(WHOLE_PADDING.left - 1e-6);
      expect(right).toBeLessThanOrEqual(width - WHOLE_PADDING.right + 1e-6);
      expect(top).toBeGreaterThanOrEqual(WHOLE_PADDING.top - 1e-6);
      expect(top).toBeLessThanOrEqual(WHOLE_PADDING.top + 1);
      expect(bottom).toBeLessThanOrEqual(height - WHOLE_PADDING.bottom + 1);
    },
  );

  it('fits a wide graph entirely at a small zoom with no lower bound', () => {
    if (bounds === null) throw new Error('no bounds');
    const wide = { ...bounds, width: bounds.width * 10 };
    const height = wholeHeight(wide, 412, 900);
    const view = wholeViewport(wide, { width: 412, height });
    expect(view.zoom).toBeLessThan(ZOOM_LIMITS.min);
    expect(view.zoom).toBeCloseTo((412 - WHOLE_PADDING.left - WHOLE_PADDING.right) / wide.width);
    expect(wide.x * view.zoom + view.x).toBeCloseTo(WHOLE_PADDING.left);
    expect((wide.x + wide.width) * view.zoom + view.x).toBeCloseTo(412 - WHOLE_PADDING.right);
    expect((wide.y + wide.height) * view.zoom + view.y).toBeLessThanOrEqual(
      height - WHOLE_PADDING.bottom + 1,
    );
  });

  it('fits a tall graph entirely when the panel cannot grow past the window', () => {
    if (bounds === null) throw new Error('no bounds');
    const tall = { ...bounds, height: bounds.height * 20 };
    expect(wholeHeight(tall, 412, 700)).toBe(700);
    const view = wholeViewport(tall, { width: 412, height: 700 });
    expect(view.zoom).toBeCloseTo((700 - WHOLE_PADDING.top - WHOLE_PADDING.bottom) / tall.height);
    expect(tall.y * view.zoom + view.y).toBeGreaterThanOrEqual(WHOLE_PADDING.top - 1e-6);
    expect((tall.y + tall.height) * view.zoom + view.y).toBeLessThanOrEqual(
      700 - WHOLE_PADDING.bottom + 1e-6,
    );
    expect(tall.x * view.zoom + view.x).toBeGreaterThanOrEqual(WHOLE_PADDING.left - 1e-6);
    expect((tall.x + tall.width) * view.zoom + view.x).toBeLessThanOrEqual(
      412 - WHOLE_PADDING.right + 1e-6,
    );
  });

  it('keeps the opening view for the editor framing', () => {
    const frame = { width: 412, height: 800 };
    expect(framedViewport(baby, frame, 'touch', 'opening')).toEqual(
      openingViewport(baby, frame, 'touch'),
    );
  });
});

describe('measured sizes', () => {
  const nodes: GraphFlowNode[] = buildGraphNodes(baby);
  const [first] = nodes;

  it('reports only cards whose measured size differs from the scene', () => {
    if (first === undefined) throw new Error('no node');
    const { w, h } = first.data.scene;
    expect(
      measuredSizes(
        [
          { type: 'dimensions', id: first.id, dimensions: { width: w, height: h } },
          { type: 'select', id: first.id, selected: true },
        ],
        nodes,
      ),
    ).toEqual([]);
    expect(
      measuredSizes(
        [{ type: 'dimensions', id: first.id, dimensions: { width: w, height: h + 30 } }],
        nodes,
      ),
    ).toEqual([{ id: first.id, w, h: h + 30 }]);
  });
});
