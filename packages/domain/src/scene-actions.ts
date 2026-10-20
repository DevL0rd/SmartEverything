import { z } from 'zod';
import { TOOL_ACTION, WAKE_AI_ACTION } from './automation-ai';
import { CAPABILITY_KEY } from './capabilities';
import { JSON_VALUE } from './values';

const NODE = { nodeId: z.uuid().brand<'AutomationNodeId'>().optional() };

export const COMMAND_ACTION = z.strictObject({
  type: z.literal('command'),
  deviceId: z.uuid(),
  capability: CAPABILITY_KEY,
  value: JSON_VALUE,
  ...NODE,
});
export type CommandAction = z.infer<typeof COMMAND_ACTION>;

export const LEGACY_ACTION = z.discriminatedUnion('type', [
  COMMAND_ACTION,
  z.object({ type: z.literal('scene'), sceneId: z.uuid(), ...NODE }),
  z.object({ type: z.literal('delay'), seconds: z.number().int().min(1).max(86_400), ...NODE }),
  z.object({ type: z.literal('notify'), message: z.string().min(1).max(500), ...NODE }),
  WAKE_AI_ACTION.extend(NODE),
  TOOL_ACTION.extend(NODE),
]);
export type LegacyAction = z.infer<typeof LEGACY_ACTION>;

export const SCENE_ACTIONS = z.array(COMMAND_ACTION);
