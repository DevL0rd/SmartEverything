import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP_OBJECT_WRITE,
  HOME_MAP_WRITE,
  placementFacts,
  type HomeMapObject,
  type HomeMapOp,
  type HomeMapVec,
} from '@smarteverything/domain';
import { objectOp } from '../../../../components/house-map/edit/ops';
import type { FurnitureTool } from './furniture';
import { idleRoomFlow } from './furniture-fixture';
import {
  ATTACHED,
  BOTTOM,
  FLOOR_ID,
  RIGHT,
  SHELF,
  SHELF_ID,
  row,
  shelf,
  wallFloor,
} from './wall-fixture';

vi.mock('react-native', () => ({ View: (): null => null, Platform: { OS: 'android' } }));
vi.mock('../../../../api/transport', () => ({ api: (): object => ({}) }));
vi.mock('../../../models', async () => {
  const wall = await import('./wall-fixture');
  return {
    useModelCatalog: (): object => ({ rows: [] }),
    useModelSpecs: (hashes: readonly (string | null)[]): readonly object[] =>
      hashes.map(() => ({ status: 'ready', value: wall.SHELF })),
  };
});

const { useFurnitureTool } = await import('./furniture');

const SHELF_ROW = row(SHELF.id, 'Floating shelf', 'b');

function run(objects: Record<string, unknown>[]): {
  readonly tool: FurnitureTool;
  readonly sent: HomeMapOp[][];
} {
  const sent: HomeMapOp[][] = [];
  const floor = wallFloor(objects);
  const map = HOME_MAP_WRITE.parse({
    ...{ schemaVersion: 1, id: 'home', name: 'Test house', revision: 1, north: 0 },
    updatedAt: '2026-10-25T00:00:00.000Z',
    floors: [floor],
    sources: [],
    notices: [],
  });
  const held: { tool: FurnitureTool | null } = { tool: null };
  function Probe(): ReactNode {
    held.tool = useFurnitureTool({
      ...{ map, floorId: FLOOR_ID, readOnly: false, selected: null, onSelect: vi.fn() },
      edit: (ops): Promise<unknown> => {
        sent.push([...ops]);
        return Promise.resolve();
      },
      onClear: vi.fn(),
      roomFlow: idleRoomFlow(),
    });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (held.tool === null) throw new Error('no tool');
  return { tool: held.tool, sent };
}

function placeShelf(at: HomeMapVec | null): HomeMapObject {
  const { tool, sent } = run([]);
  tool.place({ row: SHELF_ROW, spec: SHELF, at, rotation: 0, topAt: () => 0 });
  const op = sent[0]?.[0];
  if (op?.op !== 'add' || op.kind !== 'object') throw new Error('not an add');
  return HOME_MAP_OBJECT_WRITE.parse(op.element);
}

describe('the furniture tool with wall objects', () => {
  it('hangs a tapped wall piece on the nearest wall at its default mount height', () => {
    const element = placeShelf({ x: 4.6, y: 3 });
    expect(element.wall).toMatchObject({ wallId: RIGHT, side: 'left' });
    expect(element.rotation).toBe(180);
    expect(element.at.x).toBeCloseTo(5 - 0.05 - 0.125);
    expect(element.elevation).toBe(placementFacts(SHELF.id, SHELF)?.defaultHeightM);
  });

  it('hangs a wall piece placed without a tap on a wall of the room', () => {
    const element = placeShelf(null);
    expect([BOTTOM, RIGHT]).toContain(element.wall?.wallId);
    expect(element.elevation).toBe(placementFacts(SHELF.id, SHELF)?.defaultHeightM);
  });

  it('dragging a wall object to another wall moves its attachment and refaces it', () => {
    const { tool, sent } = run([shelf({ wall: ATTACHED })]);
    tool.send([objectOp(FLOOR_ID, SHELF_ID, { at: { x: 4.6, y: 3 } })]);
    const op = sent[0]?.[0];
    if (op?.op !== 'update' || op.kind !== 'object') throw new Error('not an update');
    const patch = HOME_MAP_OBJECT_WRITE.partial().parse(op.patch);
    expect(patch).toMatchObject({ rotation: 180, wall: { wallId: RIGHT, side: 'left' } });
    expect(patch.at?.x).toBeCloseTo(5 - 0.05 - 0.125);
  });

  it('leaves a patch that already names its wall untouched', () => {
    const { tool, sent } = run([shelf({ wall: ATTACHED })]);
    const patch = { at: { x: 1, y: 0.175 }, wall: { ...ATTACHED, offset: 1 } };
    tool.send([objectOp(FLOOR_ID, SHELF_ID, patch)]);
    expect(sent[0]?.[0]).toMatchObject({ patch });
  });
});
