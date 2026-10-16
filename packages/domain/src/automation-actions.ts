import { z } from 'zod';
import { CAPABILITY_KEY } from './capabilities';
import { JSON_VALUE } from './values';
import { DEVICE_EFFECT_OPERATION, type DeviceEffectOperation } from './device-effects';
import { DEVICE_TARGET, type DeviceTarget } from './device-targets';
import { TOOL_ACTION, WAKE_AI_ACTION } from './automation-ai';
import { CONDITIONS, type Conditions } from './automation-conditions';
import {
  AUTOMATION_COMMAND_INPUT,
  AUTOMATION_INPUT,
  type AutomationCommandInput,
  type AutomationInput,
} from './automation-bindings';
import { AUTOMATION_VALUE_ID, AUTOMATION_VALUE_OPERATION } from './automation-values';

export const MAX_AUTOMATION_DEPTH = 12;
export const MAX_AUTOMATION_NODES = 500;
export const MAX_REPEAT_COUNT = 10_000;
export const MAX_REPEAT_DURATION_MS = 86_400_000;
export const MIN_REPEAT_INTERVAL_MS = 100;
export const AUTOMATION_NODE_ID = z.uuid().brand<'AutomationNodeId'>();
export type AutomationNodeId = z.infer<typeof AUTOMATION_NODE_ID>;
const NODE = { nodeId: AUTOMATION_NODE_ID.optional() };
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
const REPEAT_MODE = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('count'), count: z.int().min(1).max(MAX_REPEAT_COUNT) }),
  z.strictObject({ mode: z.literal('while'), conditions: CONDITIONS }),
  z.strictObject({ mode: z.literal('until'), conditions: CONDITIONS }),
]);
export type RepeatMode = z.infer<typeof REPEAT_MODE>;
export interface ActionBranch {
  readonly nodeId: AutomationNodeId;
  readonly conditions: Conditions;
  readonly actions: Action[];
}
interface Node {
  readonly nodeId: AutomationNodeId;
}
export type TargetCommandAction = Node & {
  readonly type: 'target_command';
  readonly target: DeviceTarget;
  readonly capability: string;
  readonly scale?: 'percent' | undefined;
} & ({ readonly value: z.infer<typeof JSON_VALUE> } | { readonly binding: AutomationCommandInput });
export interface TemporaryEffectAction extends Node {
  readonly type: 'temporary_effect';
  readonly target: DeviceTarget;
  readonly capability: string;
  readonly operation: DeviceEffectOperation;
  readonly durationMs: number;
  readonly while?: Conditions | undefined;
  readonly priority: number;
}
export type StructuredAction =
  | TemporaryEffectAction
  | TargetCommandAction
  | (Node &
      (
        | {
            readonly type: 'command';
            readonly deviceId: string;
            readonly capability: z.infer<typeof CAPABILITY_KEY>;
            readonly binding: AutomationCommandInput;
          }
        | {
            readonly type: 'choose';
            readonly branches: ActionBranch[];
            readonly otherwise?: Action[] | undefined;
          }
        | {
            readonly type: 'repeat';
            readonly repeat: RepeatMode;
            readonly actions: Action[];
            readonly maximumDurationMs: number;
            readonly intervalMs: number;
          }
        | {
            readonly type: 'sequence';
            readonly sequenceId: string;
            readonly parameters: Record<string, AutomationInput>;
          }
        | {
            readonly type: 'value_update';
            readonly valueId: z.infer<typeof AUTOMATION_VALUE_ID>;
            readonly operation: z.infer<typeof AUTOMATION_VALUE_OPERATION>;
          }
        | {
            readonly type: 'stop';
            readonly target:
              | { readonly type: 'current' }
              | { readonly type: 'run'; readonly runId: string }
              | {
                  readonly type: 'automation' | 'sequence';
                  readonly id: string;
                  readonly controlKey?: string | undefined;
                };
          }
      ));
export type Action = LegacyAction | StructuredAction;
const BOUND_COMMAND = z.strictObject({
  type: z.literal('command'),
  nodeId: AUTOMATION_NODE_ID,
  deviceId: z.uuid(),
  capability: CAPABILITY_KEY,
  binding: AUTOMATION_COMMAND_INPUT,
});
const STOP_TARGET = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('current') }),
  z.strictObject({ type: z.literal('run'), runId: z.uuid() }),
  z.strictObject({
    type: z.enum(['automation', 'sequence']),
    id: z.uuid(),
    controlKey: z.string().trim().min(1).max(100).optional(),
  }),
]);
const TARGET_COMMAND_FIELDS = {
  type: z.literal('target_command'),
  nodeId: AUTOMATION_NODE_ID,
  target: DEVICE_TARGET,
  capability: z.string().trim().min(1).max(120),
  scale: z.literal('percent').optional(),
};
const TEMPORARY_EFFECT_ACTION = z.strictObject({
  type: z.literal('temporary_effect'),
  nodeId: AUTOMATION_NODE_ID,
  target: DEVICE_TARGET,
  capability: z.string().trim().min(1).max(120),
  operation: DEVICE_EFFECT_OPERATION,
  durationMs: z.int().min(1).max(MAX_REPEAT_DURATION_MS),
  while: CONDITIONS.optional(),
  priority: z.int().min(-1000).max(1000).default(0),
});
export const ACTION: z.ZodType<Action> = z.lazy(() =>
  z.union([
    LEGACY_ACTION.refine(
      (action) => action.type !== 'command' || !('binding' in action),
      'A command must use either value or binding',
    ),
    BOUND_COMMAND,
    TEMPORARY_EFFECT_ACTION,
    z.strictObject({ ...TARGET_COMMAND_FIELDS, value: JSON_VALUE }),
    z.strictObject({ ...TARGET_COMMAND_FIELDS, binding: AUTOMATION_COMMAND_INPUT }),
    z.strictObject({
      type: z.literal('choose'),
      nodeId: AUTOMATION_NODE_ID,
      branches: z
        .array(
          z.strictObject({
            nodeId: AUTOMATION_NODE_ID,
            conditions: CONDITIONS,
            actions: z.array(ACTION),
          }),
        )
        .min(1),
      otherwise: z.array(ACTION).optional(),
    }),
    z.strictObject({
      type: z.literal('repeat'),
      nodeId: AUTOMATION_NODE_ID,
      repeat: REPEAT_MODE,
      actions: z.array(ACTION).min(1),
      maximumDurationMs: z.int().min(MIN_REPEAT_INTERVAL_MS).max(MAX_REPEAT_DURATION_MS),
      intervalMs: z.int().min(MIN_REPEAT_INTERVAL_MS).max(MAX_REPEAT_DURATION_MS),
    }),
    z.strictObject({
      type: z.literal('sequence'),
      nodeId: AUTOMATION_NODE_ID,
      sequenceId: z.uuid(),
      parameters: z.record(z.string(), AUTOMATION_INPUT),
    }),
    z.strictObject({
      type: z.literal('value_update'),
      nodeId: AUTOMATION_NODE_ID,
      valueId: AUTOMATION_VALUE_ID,
      operation: AUTOMATION_VALUE_OPERATION,
    }),
    z.strictObject({
      type: z.literal('stop'),
      nodeId: AUTOMATION_NODE_ID,
      target: STOP_TARGET,
    }),
  ]),
);
export function actionBlocks(action: Action): readonly (readonly Action[])[] {
  if (action.type === 'choose')
    return [
      ...action.branches.map((branch) => branch.actions),
      ...(action.otherwise === undefined ? [] : [action.otherwise]),
    ];
  return action.type === 'repeat' ? [action.actions] : [];
}
export function walkActions(actions: readonly Action[]): readonly Action[] {
  return actions.flatMap((action) => [action, ...actionBlocks(action).flatMap(walkActions)]);
}
export function validateActionTree(
  actions: readonly Action[],
  context: z.RefinementCtx,
  triggerIds: readonly (string | undefined)[] = [],
): void {
  const provided = triggerIds.filter((id): id is string => id !== undefined);
  const ids = new Set<string>(provided);
  if (ids.size !== provided.length)
    context.addIssue({ code: 'custom', message: 'Duplicate trigger node identity' });
  let count = triggerIds.length;
  const visit = (block: readonly Action[], depth: number): void => {
    if (depth > MAX_AUTOMATION_DEPTH) {
      context.addIssue({ code: 'custom', message: 'Action tree exceeds maximum depth' });
      return;
    }
    for (const action of block) {
      count += 1 + (action.type === 'choose' ? action.branches.length : 0);
      const nodes = [
        action.nodeId,
        ...(action.type === 'choose' ? action.branches.map((branch) => branch.nodeId) : []),
      ];
      for (const id of nodes) {
        if (id === undefined) continue;
        if (ids.has(id))
          context.addIssue({ code: 'custom', message: `Duplicate action node ${id}` });
        ids.add(id);
      }
      for (const child of actionBlocks(action)) visit(child, depth + 1);
    }
  };
  visit(actions, 1);
  if (count > MAX_AUTOMATION_NODES)
    context.addIssue({ code: 'custom', message: 'Action tree exceeds maximum node count' });
}
export function usesStructuredActions(actions: readonly Action[]): boolean {
  return walkActions(actions).some(
    (action) =>
      !LEGACY_ACTION.safeParse(action).success ||
      (action.type === 'command' && 'binding' in action),
  );
}
