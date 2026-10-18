import { z } from 'zod';
import type { StepV2 } from '@smarteverything/domain';

export type ToolStep = Extract<StepV2, { do: 'tool' }>;

export const SPEAK_TOOL = 'speak';

const SPEAK_ARGUMENTS = z.strictObject({
  target: z.strictObject({ kind: z.literal('device'), deviceId: z.uuid() }),
  text: z.string(),
});

export interface Speech {
  readonly deviceId: string;
  readonly text: string;
}

export function speechOf(step: ToolStep): Speech | null {
  if (step.tool !== SPEAK_TOOL) return null;
  const args = SPEAK_ARGUMENTS.safeParse(step.args);
  return args.success ? { deviceId: args.data.target.deviceId, text: args.data.text } : null;
}

export function speechStep(step: ToolStep, speech: Speech): ToolStep {
  return {
    ...step,
    tool: SPEAK_TOOL,
    args: { target: { kind: 'device', deviceId: speech.deviceId }, text: speech.text },
  };
}
