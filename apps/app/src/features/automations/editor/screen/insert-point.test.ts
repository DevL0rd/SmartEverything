import { NODE_REGISTRY } from '@smarteverything/domain';
import { EMPTY_LAYOUT } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { projectScene } from '../../model/canvas/project-scene';
import { airPurifier } from '../../model/fixtures/air-purifier';
import { findInsertPoint } from './insert-point';

const scene = projectScene(airPurifier(), {
  registry: NODE_REGISTRY,
  layout: EMPTY_LAYOUT,
  mode: 'wide',
});

describe('finding the insert point behind a canvas tap', () => {
  it('resolves an edge tap to the insert point on that edge', () => {
    const onEdge = scene.insertPoints.find((point) => point.edgeId !== null);
    expect(onEdge).toBeDefined();
    const found = findInsertPoint(scene, { kind: 'edge', edgeId: onEdge?.edgeId ?? '' });
    expect(found?.id).toBe(onEdge?.id);
  });

  it('resolves a slot tap to the insert point of that slot', () => {
    const inSlot = scene.insertPoints.find((point) => point.slotId !== null);
    if (inSlot === undefined) return;
    expect(findInsertPoint(scene, { kind: 'slot', slotId: inSlot.slotId ?? '' })?.id).toBe(
      inSlot.id,
    );
  });

  it('returns null when the spot is gone', () => {
    expect(findInsertPoint(scene, { kind: 'edge', edgeId: 'missing' })).toBeNull();
    expect(findInsertPoint(scene, { kind: 'slot', slotId: 'missing' })).toBeNull();
  });
});
