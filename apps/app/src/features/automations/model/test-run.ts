import {
  SCENE_ACTIONS,
  validateCommand,
  type LegacyAction as Action,
  type CommandAction,
  type JsonValue,
} from '@smarteverything/domain';
import type { DeviceLike } from './capability-choices';
import { rawErrorText } from '../../../format/errors';

interface PlannedCommand {
  readonly device: DeviceLike;
  readonly capability: string;
  readonly value: JsonValue;
  readonly source: 'automation' | 'scene';
}

export type Step =
  | { readonly kind: 'commands'; readonly commands: readonly PlannedCommand[] }
  | { readonly kind: 'skipped-wait'; readonly seconds: number }
  | { readonly kind: 'notice'; readonly message: string }
  | { readonly kind: 'skipped-ai' };

export class TestRunError extends Error {
  override readonly name = 'TestRunError';

  constructor(
    readonly step: number,
    readonly reason: string,
  ) {
    super(`Step ${String(step)} can’t run: ${reason}.`);
  }
}

export interface RunnableScene {
  readonly id: string;
  readonly name: string;
  readonly actions: unknown;
}

interface PlanContext {
  readonly devices: readonly DeviceLike[];
  readonly scenes: readonly RunnableScene[];
  readonly step: number;
}

function planned(
  context: PlanContext,
  action: CommandAction,
  source: PlannedCommand['source'],
): PlannedCommand {
  const device = context.devices.find((candidate) => candidate.id === action.deviceId);
  if (device === undefined) {
    throw new TestRunError(context.step, 'a device it uses is no longer in this home');
  }
  try {
    const value = validateCommand(device, action);
    return { device, capability: action.capability, value, source };
  } catch (error) {
    throw new TestRunError(context.step, rawErrorText(error));
  }
}

function sceneCommands(context: PlanContext, sceneId: string): PlannedCommand[] {
  const scene = context.scenes.find((candidate) => candidate.id === sceneId);
  if (scene === undefined) {
    throw new TestRunError(context.step, 'the scene it runs was deleted');
  }
  const actions = SCENE_ACTIONS.safeParse(scene.actions);
  if (!actions.success || actions.data.length === 0) {
    throw new TestRunError(context.step, `the scene ${scene.name} has no usable settings`);
  }
  return actions.data.map((action) => planned(context, action, 'scene'));
}

function stepOf(context: PlanContext, action: Action): Step {
  switch (action.type) {
    case 'command':
      return { kind: 'commands', commands: [planned(context, action, 'automation')] };
    case 'scene':
      return { kind: 'commands', commands: sceneCommands(context, action.sceneId) };
    case 'delay':
      return { kind: 'skipped-wait', seconds: action.seconds };
    case 'notify':
      return { kind: 'notice', message: action.message };
    case 'wake_ai':
    case 'tool':
      return { kind: 'skipped-ai' };
  }
}

export function planTestRun(
  actions: readonly Action[],
  devices: readonly DeviceLike[],
  scenes: readonly RunnableScene[],
): Step[] {
  return actions.map((action, index) => stepOf({ devices, scenes, step: index + 1 }, action));
}

export function commandCount(steps: readonly Step[]): number {
  return steps.reduce(
    (total, step) => total + (step.kind === 'commands' ? step.commands.length : 0),
    0,
  );
}
