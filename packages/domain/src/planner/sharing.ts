import { z } from 'zod';
import { PLANNER_COLOUR } from './collections';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_SHARE_ROLES = ['view', 'edit'] as const;

export type PlannerShareRole = (typeof PLANNER_SHARE_ROLES)[number];

export const PLANNER_COLLECTION_SHARE_ROW = z
  .strictObject({
    collection_id: ID,
    profile_id: ID,
    role: z.enum(PLANNER_SHARE_ROLES),
    colour: PLANNER_COLOUR.nullable(),
    visible: z.boolean(),
    created_at: MOMENT,
  })
  .readonly();

export type PlannerCollectionShareRow = z.infer<typeof PLANNER_COLLECTION_SHARE_ROW>;

export const PLANNER_SHARE_SET = z.strictObject({ role: z.enum(PLANNER_SHARE_ROLES) });

export const PLANNER_SHARE_VIEWER_CHANGES = z
  .strictObject({ colour: PLANNER_COLOUR.nullable(), visible: z.boolean() })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'name at least one field to change',
  });
