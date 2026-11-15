import type { ModelSpec } from '@smarteverything/domain';
import type { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import { KINGSMITH_G15_MODEL } from '../../../../../../packages/ble/src/kingsmith/model';
import { buildModel, type BuiltModel } from './build-model';

const CLEARANCE_M = 0.005;

const UNDER_THE_MAST = /^(deck|belt|rail)/;

function onHinge(spec: ModelSpec, id: string): boolean {
  const part = spec.parts.find((candidate) => candidate.id === id);
  if (part?.parent === undefined) return false;
  return part.parent === 'hinge' || onHinge(spec, part.parent);
}

function partBox(model: BuiltModel, id: string): Box3 {
  const part = model.parts.find((candidate) => candidate.id === id);
  if (part === undefined) throw new Error(`no part ${id}`);
  part.mesh.geometry.computeBoundingBox();
  const local = part.mesh.geometry.boundingBox;
  if (local === null) throw new Error(`no bounds for ${id}`);
  return local.clone().applyMatrix4(part.mesh.matrixWorld);
}

function folded(): { readonly model: BuiltModel; readonly mast: Box3[]; readonly deck: Box3[] } {
  const model = buildModel(KINGSMITH_G15_MODEL, { lod: 2, params: { folded: 1 } });
  model.group.updateMatrixWorld(true);
  const ids = model.parts.map((part) => part.id);
  const mastIds = ids.filter((id) => onHinge(KINGSMITH_G15_MODEL, id));
  const deckIds = ids.filter((id) => UNDER_THE_MAST.test(id));
  return {
    model,
    mast: mastIds.map((id) => partBox(model, id)),
    deck: deckIds.map((id) => partBox(model, id)),
  };
}

function overlapsFromAbove(upper: Box3, lower: Box3): boolean {
  return (
    upper.min.x < lower.max.x &&
    upper.max.x > lower.min.x &&
    upper.min.z < lower.max.z &&
    upper.max.z > lower.min.z
  );
}

describe('Kingsmith G15 fold', () => {
  it('lays the mast over the deck without passing through the belt, deck or rails', () => {
    const { model, mast, deck } = folded();
    for (const upper of mast) {
      for (const lower of deck.filter((box) => overlapsFromAbove(upper, box))) {
        expect(upper.min.y).toBeGreaterThanOrEqual(lower.max.y + CLEARANCE_M);
      }
    }
    model.dispose();
  });

  it('folds the mast down to under half its standing height', () => {
    const { model, mast } = folded();
    const rest = buildModel(KINGSMITH_G15_MODEL, { lod: 2, params: { folded: 0 } });
    rest.group.updateMatrixWorld(true);
    const standing = partBox(rest, 'console').max.y;
    expect(Math.max(...mast.map((box) => box.max.y))).toBeLessThan(standing / 2);
    rest.dispose();
    model.dispose();
  });
});
