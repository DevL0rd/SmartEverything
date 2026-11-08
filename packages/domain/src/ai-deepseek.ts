import { z } from 'zod';

export const DEEPSEEK_KEY = z.string().trim().regex(/^\S+$/, 'a DeepSeek key without spaces');

export const DEEPSEEK_STATUS = z.strictObject({
  key: z.enum(['set', 'missing']),
});

export type DeepSeekStatus = z.infer<typeof DEEPSEEK_STATUS>;

export const DEEPSEEK_KEY_REFERENCE = 'DEEPSEEK_API_KEY';

export const HARNESS_API_KEY = z.strictObject({ value: z.string().min(1).nullable() });
