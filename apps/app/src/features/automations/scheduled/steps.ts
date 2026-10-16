import {
  CAPABILITY_KEY,
  JSON_VALUE,
  type LegacyAction as Action,
  type McpToolName,
  type ScheduleStep,
  type ScheduleStepInput,
} from '@smarteverything/domain';
import { z } from 'zod';

const CONTROL_DEVICES: McpToolName = 'control_devices';
const RUN_SCENE: McpToolName = 'run_scene';
const LONGEST_DELAY = 86_400;

export const STEP_ACTION_TYPES = ['command', 'scene', 'delay'] as const;

const CONTROL_ARGS = z.strictObject({
  changes: z.tuple([
    z.strictObject({
      target: z.strictObject({ deviceIds: z.tuple([z.uuid()]) }),
      capability: CAPABILITY_KEY,
      value: JSON_VALUE,
    }),
  ]),
});

const RUN_SCENE_ARGS = z.strictObject({ sceneId: z.uuid() });

export function stepOf(action: Action): ScheduleStepInput | null {
  switch (action.type) {
    case 'command':
      return {
        kind: 'tool',
        tool: CONTROL_DEVICES,
        args: {
          changes: [
            {
              target: { deviceIds: [action.deviceId] },
              capability: action.capability,
              value: action.value,
            },
          ],
        },
      };
    case 'scene':
      return { kind: 'tool', tool: RUN_SCENE, args: { sceneId: action.sceneId } };
    case 'delay':
      return { kind: 'wait', seconds: action.seconds };
    case 'notify':
    case 'wake_ai':
    case 'tool':
      return null;
  }
}

export function stepsOf(actions: readonly Action[]): ScheduleStepInput[] {
  return actions.flatMap((action) => {
    const step = stepOf(action);
    return step === null ? [] : [step];
  });
}

function actionOf(step: ScheduleStep): Action | null {
  if (step.kind === 'wait') {
    return step.seconds <= LONGEST_DELAY ? { type: 'delay', seconds: step.seconds } : null;
  }
  if (step.kind !== 'tool') {
    return null;
  }
  if (step.tool === CONTROL_DEVICES) {
    const args = CONTROL_ARGS.safeParse(step.args);
    if (!args.success) {
      return null;
    }
    const [change] = args.data.changes;
    const [deviceId] = change.target.deviceIds;
    return { type: 'command', deviceId, capability: change.capability, value: change.value };
  }
  if (step.tool === RUN_SCENE) {
    const args = RUN_SCENE_ARGS.safeParse(step.args);
    return args.success ? { type: 'scene', sceneId: args.data.sceneId } : null;
  }
  return null;
}

export function actionsOf(steps: readonly ScheduleStep[]): Action[] | null {
  const actions = steps.map(actionOf);
  return actions.every((action): action is Action => action !== null) ? actions : null;
}

export function powerActions(deviceId: string, on: boolean): Action[] {
  return [{ type: 'command', deviceId, capability: 'power', value: on }];
}

export function powerVerbOf(steps: readonly ScheduleStep[], deviceId: string): string | null {
  for (const action of actionsOf(steps) ?? []) {
    if (
      action.type === 'command' &&
      action.deviceId === deviceId &&
      action.capability === 'power'
    ) {
      return action.value === false ? 'Off' : 'On';
    }
  }
  return null;
}
