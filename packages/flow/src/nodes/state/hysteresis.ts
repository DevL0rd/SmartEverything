import { z } from 'zod';

export const HYSTERESIS_MEMORY = z.strictObject({ high: z.boolean() });
export type HysteresisMemory = z.infer<typeof HYSTERESIS_MEMORY>;

export const HYSTERESIS_REQUEST = z
  .strictObject({
    value: z.number(),
    high: z.number(),
    low: z.number(),
    initial: z.boolean().default(false),
  })
  .refine((request) => request.low <= request.high, {
    message: 'the low threshold must not exceed the high threshold',
  });
export type HysteresisRequest = z.input<typeof HYSTERESIS_REQUEST>;

export interface HysteresisOutcome {
  readonly state: boolean;
  readonly rose: boolean;
  readonly fell: boolean;
  readonly memory: HysteresisMemory;
}

function crossed(value: number, high: number, low: number, was: boolean): boolean {
  if (value >= high) return true;
  if (value <= low) return false;
  return was;
}

export function hysteresis(
  memory: HysteresisMemory | undefined,
  input: HysteresisRequest,
): HysteresisOutcome {
  const { value, high, low, initial } = HYSTERESIS_REQUEST.parse(input);
  const was = memory?.high ?? initial;
  const state = crossed(value, high, low, was);
  return {
    state,
    rose: state && !was,
    fell: !state && was,
    memory: { high: state },
  };
}
