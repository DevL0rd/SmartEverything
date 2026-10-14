import { deepFreeze } from '@deepseek-ai/dsh-util-values';
import { z } from 'zod';
import catalogue from '../../skills/catalogue.json' with { type: 'json' };

export const PRODUCT_SKILLS = deepFreeze(
  z
    .strictObject({
      revision: z.string().regex(/^[a-f0-9]{64}$/u),
      skills: z
        .array(
          z.strictObject({
            name: z.string().regex(/^smarteverything-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
            description: z.string().min(1).max(500),
            content: z.string().min(1),
            invocation: z.strictObject({
              modelInvocable: z.literal(true),
              userInvocable: z.literal(true),
            }),
          }),
        )
        .min(1)
        .max(32),
    })
    .parse(catalogue),
);
