import { z } from 'zod';

const STEP = z.object({
  name: z.string().min(1),
  program: z.string().min(1),
  args: z.array(z.string()),
  cwd: z.string().min(1),
});

export const STEPS_REQUEST = z.object({
  tag: z.string().min(1),
  environment: z.record(z.string(), z.string()),
  steps: z.array(STEP),
});

export type StepRequest = z.infer<typeof STEPS_REQUEST>;

export const STEP_EVENT = z.union([
  z.strictObject({ started: z.string().min(1) }),
  z.strictObject({ failed: z.string().min(1) }),
  z.strictObject({ finished: z.boolean() }),
]);

export type StepEvent = z.infer<typeof STEP_EVENT>;

export function eventLine(event: StepEvent): string {
  return `${JSON.stringify(event)}\n`;
}
