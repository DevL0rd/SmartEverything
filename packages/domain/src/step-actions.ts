import { z } from 'zod';
import { TOOL_ACTION, WAKE_AI_ACTION } from './automation-ai';
import { CAPABILITY_KEY } from './capabilities';
import { JSON_VALUE } from './values';

export const STEP_ACTION_NODE = { nodeId: z.uuid().brand<'AutomationNodeId'>().optional() };

export const COMMAND_ACTION = z.strictObject({
  type: z.literal('command'),
  deviceId: z.uuid(),
  capability: CAPABILITY_KEY,
  value: JSON_VALUE,
  ...STEP_ACTION_NODE,
});
export type CommandAction = z.infer<typeof COMMAND_ACTION>;

export const STEP_ACTION_KINDS = [
  COMMAND_ACTION,
  z.object({
    type: z.literal('delay'),
    seconds: z.number().int().min(1).max(86_400),
    ...STEP_ACTION_NODE,
  }),
  z.object({ type: z.literal('notify'), message: z.string().min(1).max(500), ...STEP_ACTION_NODE }),
  WAKE_AI_ACTION.extend(STEP_ACTION_NODE),
  TOOL_ACTION.extend(STEP_ACTION_NODE),
] as const;

export const STEP_ACTION = z.discriminatedUnion('type', STEP_ACTION_KINDS);
export type StepAction = z.infer<typeof STEP_ACTION>;
