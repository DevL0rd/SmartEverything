import { describe, expect, it } from 'vitest';
import { CANVAS_INTENT, CANVAS_PROPS, PROBLEM_INPUT, RUN_OVERLAY, SCENE } from './contract';
import { Ids, WIDE, automation, note } from './canvas-fixtures';
import { projectScene } from './project-scene';

describe('canvas contract', () => {
  it('accepts a projected scene and rejects a scene with a stray field', () => {
    const scene = projectScene(automation([note(new Ids(1), 'x')]), WIDE);
    expect(SCENE.safeParse(scene).success).toBe(true);
    expect(SCENE.safeParse({ ...scene, extra: 1 }).success).toBe(false);
    expect(SCENE.safeParse({ ...scene, version: 2 }).success).toBe(false);
  });

  it('rejects a node with a non-positive size', () => {
    const scene = projectScene(automation([note(new Ids(1), 'x')]), WIDE);
    const first = scene.nodes[0];
    if (first === undefined) throw new Error('no node');
    expect(SCENE.safeParse({ ...scene, nodes: [{ ...first, w: 0 }] }).success).toBe(false);
  });

  it('parses every intent the canvas can send and refuses unknown ones', () => {
    const end = { nodeId: 'a', port: 'next' };
    const valid = [
      { type: 'select', ids: ['a'] },
      { type: 'connect', connection: { from: end, to: { nodeId: 'b', port: 'in' } } },
      { type: 'move', patches: [{ id: 'a', x: 1, y: 2 }] },
      { type: 'delete', ids: ['a'] },
      { type: 'openNode', id: 'a' },
      { type: 'insertOnEdge', edgeId: 'e' },
      { type: 'openSlot', slotId: 's' },
      { type: 'portDropEmpty', from: end, point: { x: 1, y: 2 } },
      { type: 'shortcut', name: 'undo' },
      { type: 'viewportSettled', viewport: { x: 0, y: 0, zoom: 0.85 } },
      { type: 'ready', metrics: { width: 800, height: 600 } },
    ];
    for (const intent of valid) expect(CANVAS_INTENT.safeParse(intent).success).toBe(true);
    expect(CANVAS_INTENT.safeParse({ type: 'move', patches: [] }).success).toBe(false);
    expect(CANVAS_INTENT.safeParse({ type: 'shortcut', name: 'format' }).success).toBe(false);
    expect(CANVAS_INTENT.safeParse({ type: 'teleport' }).success).toBe(false);
    expect(CANVAS_INTENT.safeParse({ type: 'select', ids: [1] }).success).toBe(false);
  });

  it('parses the props handed to the canvas', () => {
    const scene = projectScene(automation([note(new Ids(1), 'x')]), WIDE);
    const props = {
      scene,
      theme: { '--se-bg': '#000' },
      run: { a: { state: 'running', iteration: 2 } },
      selection: [],
      focusNode: null,
      viewportCommand: { type: 'fit', seq: 1 },
      active: true,
      idiom: 'touch',
    };
    expect(CANVAS_PROPS.safeParse(props).success).toBe(true);
    expect(CANVAS_PROPS.safeParse({ ...props, idiom: 'mouse' }).success).toBe(false);
  });

  it('parses run overlays and problems', () => {
    expect(RUN_OVERLAY.safeParse({ a: { state: 'done', text: '62 %' } }).success).toBe(true);
    expect(RUN_OVERLAY.safeParse({ a: { state: 'paused' } }).success).toBe(false);
    expect(
      PROBLEM_INPUT.safeParse({ nodeId: 'a', severity: 'warning', message: 'Careful' }).success,
    ).toBe(true);
    expect(PROBLEM_INPUT.safeParse({ nodeId: 'a', severity: 'info', message: 'x' }).success).toBe(
      false,
    );
  });
});
