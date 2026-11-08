import { z } from 'zod';
import { MOMENT } from './api/primitives';
import { HOME_MAP_ELEMENT_ID } from './home-map-elements';

export const HOME_MAP_ACTOR_KINDS = ['profile', 'ai', 'source'] as const;

export type HomeMapActorKind = (typeof HOME_MAP_ACTOR_KINDS)[number];

export const HOME_MAP_ACTOR = z.string().regex(/^(profile|ai|source):.+$/);

export type HomeMapActor = z.infer<typeof HOME_MAP_ACTOR>;

export function homeMapActorKind(actor: HomeMapActor): HomeMapActorKind | null {
  return HOME_MAP_ACTOR_KINDS.find((kind) => actor.startsWith(`${kind}:`)) ?? null;
}

export const HOME_MAP_EDIT_KINDS = [
  'room',
  'wall',
  'opening',
  'object',
  'placement',
  'annotation',
  'source',
  'notice',
] as const;

export type HomeMapEditKind = (typeof HOME_MAP_EDIT_KINDS)[number];

export const HOME_MAP_CONFLICT_REASONS = [
  'missing_floor',
  'missing_element',
  'missing_parent',
  'exists',
  'invalid',
  'locked',
  'order_mismatch',
] as const;

export type HomeMapConflictReason = (typeof HOME_MAP_CONFLICT_REASONS)[number];

const RECORD = z.record(z.string(), z.unknown());

const INDEX = z.int().nonnegative();

const TARGET = {
  kind: z.enum(HOME_MAP_EDIT_KINDS),
  floorId: HOME_MAP_ELEMENT_ID.optional(),
};

export const HOME_MAP_OP = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('add'), ...TARGET, element: RECORD, index: INDEX.optional() }),
  z.strictObject({ op: z.literal('update'), ...TARGET, id: HOME_MAP_ELEMENT_ID, patch: RECORD }),
  z.strictObject({ op: z.literal('remove'), ...TARGET, id: HOME_MAP_ELEMENT_ID }),
  z.strictObject({
    op: z.literal('move'),
    ...TARGET,
    id: HOME_MAP_ELEMENT_ID,
    dx: z.number(),
    dy: z.number(),
  }),
  z.strictObject({ op: z.literal('addFloor'), floor: RECORD, index: INDEX.optional() }),
  z.strictObject({ op: z.literal('removeFloor'), floorId: HOME_MAP_ELEMENT_ID }),
  z.strictObject({ op: z.literal('setFloor'), floorId: HOME_MAP_ELEMENT_ID, patch: RECORD }),
  z.strictObject({ op: z.literal('reorderFloors'), order: z.array(HOME_MAP_ELEMENT_ID) }),
  z.strictObject({ op: z.literal('setMap'), patch: RECORD }),
  z.strictObject({ op: z.literal('setScan'), scan: RECORD }),
  z.strictObject({ op: z.literal('setScanTransform'), patch: RECORD }),
  z.strictObject({ op: z.literal('removeScan') }),
]);

export type HomeMapOp = z.infer<typeof HOME_MAP_OP>;

export const HOME_MAP_EDIT_BATCH = z.strictObject({
  baseRevision: INDEX,
  ops: z.array(HOME_MAP_OP).min(1),
});

export type HomeMapEditBatch = z.infer<typeof HOME_MAP_EDIT_BATCH>;

export const HOME_MAP_EDIT_CONFLICT = z.strictObject({
  index: INDEX,
  op: z.string().min(1),
  kind: z.string().min(1).nullable(),
  id: z.string().min(1).nullable(),
  reason: z.enum(HOME_MAP_CONFLICT_REASONS),
});

export type HomeMapEditConflict = z.infer<typeof HOME_MAP_EDIT_CONFLICT>;

export const HOME_MAP_REVISION_ENTRY = z.strictObject({
  revision: z.int().positive(),
  ops: z.array(HOME_MAP_OP),
  inverse: z.array(HOME_MAP_OP),
  actor: HOME_MAP_ACTOR,
  at: MOMENT,
  undoes: z.int().positive().optional(),
  redoes: z.int().positive().optional(),
});

export type HomeMapRevisionEntry = z.infer<typeof HOME_MAP_REVISION_ENTRY>;

export const HOME_MAP_FLOOR_PATCH = z.strictObject({
  name: z.string().optional(),
  level: z.int().optional(),
  elevation: z.number().optional(),
  ceilingHeight: z.number().positive().optional(),
});

export const HOME_MAP_META_PATCH = z.strictObject({
  name: z.string().optional(),
  north: z.number().optional(),
});
