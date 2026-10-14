import { z } from 'zod';
import { AI_NATIVE_SKILL_METADATA } from '@smarteverything/domain';

export const SKILLS_LIST_PARAMS = z.strictObject({
  cwds: z.array(z.string().min(1).max(4096)).length(1),
  forceReload: z.boolean().optional(),
});
export const SKILL_METADATA = AI_NATIVE_SKILL_METADATA.extend({
  name: z.string().min(1).max(200),
  description: z.string().max(4000),
  path: z.string().min(1).max(4096),
});
export const SKILLS_LIST_REPLY = z.object({
  data: z
    .array(
      z.object({
        cwd: z.string().min(1).max(4096),
        skills: z.array(SKILL_METADATA).max(1999),
        errors: z
          .array(
            z.object({
              path: z.string().max(4096),
              message: z.string().max(16_000),
            }),
          )
          .max(2000),
      }),
    )
    .length(1),
});
export const SKILLS_CHANGED = z.strictObject({});

export const SKILL_USER_INPUT = z.strictObject({
  type: z.literal('skill'),
  name: z.string().min(1).max(200),
  path: z.string().min(1).max(4096),
});
