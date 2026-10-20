import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY, EMPTY_LAYOUT } from '@smarteverything/domain';
import { Ids, add, automation, setLight } from '../../model/canvas/canvas-fixtures';
import { COMPACT } from '../../model/canvas/metrics';
import type { Scene } from '../../model/canvas/contract';
import { projectScene } from '../../model/canvas/project-scene';
import {
  COMPACT_BELOW_WIDTH,
  OPENING_ZOOM,
  commandKey,
  openingViewport,
  portsAreTargets,
  sizeClassFor,
  zoomLimits,
} from './viewport';

function sceneOf(mode: 'wide' | 'compact'): Scene {
  const ids = new Ids(1);
  const program = automation([setLight(ids, null), add(ids, null)]);
  return projectScene(program, {
    registry: NODE_REGISTRY,
    layout: EMPTY_LAYOUT,
    mode,
    ...(mode === 'compact' ? { canvasWidth: 375 } : {}),
  });
}

describe('canvas viewport', () => {
  it('selects the compact layout below 560 px', () => {
    expect(sizeClassFor(COMPACT_BELOW_WIDTH - 1)).toBe('compact');
    expect(sizeClassFor(COMPACT_BELOW_WIDTH)).toBe('wide');
    expect(sizeClassFor(412)).toBe('compact');
    expect(sizeClassFor(1440)).toBe('wide');
  });

  it('opens the wide view at 0.85 with the triggers in the top left', () => {
    const scene = sceneOf('wide');
    const opening = openingViewport(scene);
    const left = Math.min(...scene.nodes.filter((n) => n.role === 'trigger').map((n) => n.x));
    expect(opening.zoom).toBe(OPENING_ZOOM.wide);
    expect(left * opening.zoom + opening.x).toBeGreaterThan(0);
    expect(left * opening.zoom + opening.x).toBeLessThan(48);
  });

  it('opens the compact view at 1.0 from the top inside the gutter', () => {
    const opening = openingViewport(sceneOf('compact'));
    expect(opening.zoom).toBe(1);
    expect(opening.x).toBe(COMPACT.gutter);
  });

  it('keeps pinch limits per layout', () => {
    expect(zoomLimits('compact')).toEqual({ min: 0.5, max: 1.6 });
    expect(zoomLimits('wide').min).toBeLessThan(0.34);
  });

  it('makes ports touch targets only from zoom 0.9', () => {
    expect(portsAreTargets(0.89, 'touch')).toBe(false);
    expect(portsAreTargets(0.9, 'touch')).toBe(true);
    expect(portsAreTargets(0.3, 'pointer')).toBe(true);
  });

  it('keys a command by type and sequence', () => {
    expect(commandKey(null)).toBe('');
    expect(commandKey({ type: 'fit', seq: 2 })).not.toBe(commandKey({ type: 'fit', seq: 3 }));
  });
});
