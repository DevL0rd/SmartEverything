import { z } from 'zod';

const PRODUCT_SKILL = z.strictObject({
  name: z.string().regex(/^smarteverything-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  description: z.string().min(1).max(1024),
  content: z.string().min(1),
  invocation: z.strictObject({
    modelInvocable: z.literal(true),
    userInvocable: z.literal(true),
  }),
});

export const PRODUCT_SKILL_LIST = z.array(PRODUCT_SKILL).min(1).max(32);

export const PRODUCT_SKILL_CATALOGUE = z.strictObject({
  revision: z.string().regex(/^[a-f0-9]{64}$/u),
  skills: PRODUCT_SKILL_LIST,
});
