import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  Position,
  applyNodeChanges,
  getBezierPath,
  getSmoothStepPath,
  type Node,
} from '@xyflow/react';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

describe('@xyflow/react contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, '@xyflow/react')).toBe(installedVersion('@xyflow/react'));
  });

  it('moves a node when it applies a position change and leaves the others untouched', () => {
    const nodes: Node[] = [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 5, y: 5 }, data: {} },
    ];
    const next = applyNodeChanges(
      [{ type: 'position', id: 'a', position: { x: 10, y: 20 } }],
      nodes,
    );
    expect(next[0]?.position).toEqual({ x: 10, y: 20 });
    expect(next[1]).toBe(nodes[1]);
  });

  it('marks a node selected and removes a node by change', () => {
    const nodes: Node[] = [{ id: 'a', position: { x: 0, y: 0 }, data: {} }];
    expect(
      applyNodeChanges([{ type: 'select', id: 'a', selected: true }], nodes)[0]?.selected,
    ).toBe(true);
    expect(applyNodeChanges([{ type: 'remove', id: 'a' }], nodes)).toEqual([]);
  });

  it('draws a bezier path and a step path between two handles', () => {
    const geometry = {
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Right,
      targetX: 100,
      targetY: 50,
      targetPosition: Position.Left,
    };
    const [bezier, bezierX, bezierY] = getBezierPath(geometry);
    expect(bezier).toMatch(/^M ?0,?0 ?C/);
    expect(bezierX).toBe(50);
    expect(bezierY).toBe(25);
    expect(getSmoothStepPath(geometry)[0]).toMatch(/^M ?0 ?,?0 ?L/);
  });

  it('ships the base stylesheet with the handle class and the overridable edge variable', () => {
    const css = readFileSync(repositoryFile('node_modules/@xyflow/react/dist/base.css'), 'utf8');
    expect(css).toContain('.react-flow__handle');
    expect(css).toContain('--xy-edge-stroke,');
  });
});
