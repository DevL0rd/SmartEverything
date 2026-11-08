import { z } from 'zod';
import { NO_INPUT } from '../tool-kit';

export const ACT_INPUT = z.strictObject({
  action: z.string().min(1),
  volume: z.string().min(1).optional(),
  mood: z.string().min(1).optional(),
});

export const ACT_TOOL = { name: 'act', input: ACT_INPUT };

export const FORGET_TOOL = { name: 'forget', input: NO_INPUT };

export const REFUSED_CODE = 'refused';

export function optionsOf(input: z.output<typeof ACT_INPUT>): Record<string, string> {
  return {
    ...(input.volume === undefined ? {} : { volume: input.volume }),
    ...(input.mood === undefined ? {} : { mood: input.mood }),
  };
}
