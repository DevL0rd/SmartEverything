import type { JsonValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { swapImportedAxes } from '../../src/store/migrations/home-map-object-axes';

const origin = (overridden: readonly string[]): JsonValue => ({
  kind: 'source',
  sourceId: 'robot',
  ref: 'carpet:0',
  overridden: [...overridden],
});

const rug = (overridden: readonly string[]): Readonly<Record<string, JsonValue>> => ({
  id: 'rug',
  modelId: 'cat.rugs.rug-rectangle',
  params: { width: 1.9, depth: 1.0, height: 0.01 },
  rotation: 30,
  origin: origin(overridden),
});

describe('swapping the axes of imported objects', () => {
  it('swaps width and depth of imported objects in maps and revision ops, once each', () => {
    const map = {
      floors: [{ objects: [rug([]), { ...rug([]), id: 'hand', origin: { kind: 'hand' } }] }],
    };
    const turned = swapImportedAxes(map);
    expect(turned.objects).toBe(1);
    expect(turned.value).toEqual({
      floors: [
        {
          objects: [
            { ...rug([]), params: { width: 1.0, depth: 1.9, height: 0.01 } },
            { ...rug([]), id: 'hand', origin: { kind: 'hand' } },
          ],
        },
      ],
    });
    const ops = [{ op: 'add', kind: 'object', element: rug([]) }];
    expect(swapImportedAxes(ops).objects).toBe(1);
  });

  it('keeps objects whose size the owner changed and objects without both sizes', () => {
    expect(swapImportedAxes(rug(['params'])).objects).toBe(0);
    const lone = { ...rug([]), params: { width: 2 } };
    expect(swapImportedAxes(lone)).toEqual({ value: lone, objects: 0 });
  });
});
