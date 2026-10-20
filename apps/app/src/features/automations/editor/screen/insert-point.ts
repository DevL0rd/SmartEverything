import type { InsertPoint, Scene } from '../../model/canvas/contract';

export type InsertTarget =
  | { readonly kind: 'edge'; readonly edgeId: string }
  | { readonly kind: 'slot'; readonly slotId: string };

export const SPOT_GONE = 'That spot is not there any more. Pick another one.';

export function findInsertPoint(scene: Scene, target: InsertTarget): InsertPoint | null {
  const found = scene.insertPoints.find((point) =>
    target.kind === 'edge' ? point.edgeId === target.edgeId : point.slotId === target.slotId,
  );
  return found ?? null;
}
