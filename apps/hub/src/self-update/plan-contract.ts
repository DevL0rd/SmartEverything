import { HUB_UPDATE_COMMIT, PIPELINE_COMPONENTS } from '@smarteverything/domain';
import { z } from 'zod';

export const PLAN_REQUEST = z.strictObject({
  tip: HUB_UPDATE_COMMIT,
  pushedFrom: HUB_UPDATE_COMMIT.nullable(),
  base: HUB_UPDATE_COMMIT.nullable(),
});

export type PlanRequest = z.infer<typeof PLAN_REQUEST>;

export const PLAN_RESULT = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('planned'),
    base: HUB_UPDATE_COMMIT,
    components: z.array(z.enum(PIPELINE_COMPONENTS)),
    notes: z.string().min(1).nullable(),
  }),
  z.strictObject({ status: z.enum(['refused', 'superseded']), message: z.string().min(1) }),
]);

export type PlanResult = z.infer<typeof PLAN_RESULT>;
