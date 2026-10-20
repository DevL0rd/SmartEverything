import { type DeviceTarget } from '@smarteverything/domain';
import type { Action, StructuredAction } from './v1-actions';
import {
  UnmigratedError,
  idOf,
  inputV2Of,
  literalOf,
  toOfCommand,
  toOfLiteral,
} from './v2-convert-input';
import { conditionsV2Of } from './v2-convert-when';
import { SET_CONTROL, type SetControl, type StepV2, type TargetV2 } from './v2-schema';

interface Id {
  readonly id?: string;
}
type DeviceAction = Extract<Action, { type: 'command' | 'target_command' | 'temporary_effect' }>;
type SimpleAction = Extract<Action, { type: 'scene' | 'delay' | 'notify' | 'wake_ai' | 'tool' }>;
type FlowAction = Exclude<Action, DeviceAction | SimpleAction>;

function controlOf(capability: string): SetControl {
  const parsed = SET_CONTROL.safeParse(capability);
  if (!parsed.success)
    throw new UnmigratedError(`${capability} is not a capability a v2 set can drive`);
  return parsed.data;
}

function targetV2Of(target: DeviceTarget): TargetV2 {
  switch (target.kind) {
    case 'room':
      return {
        room: target.roomId,
        ...(target.families === undefined ? {} : { families: target.families }),
      };
    case 'group':
      return { group: target.groupId };
    case 'devices':
      return { devices: target.deviceIds };
  }
}

function deviceStepV2Of(action: DeviceAction, id: Id): StepV2 {
  switch (action.type) {
    case 'command':
      return {
        do: 'set',
        ...id,
        target: { device: action.deviceId },
        control: controlOf(action.capability),
        to: 'binding' in action ? toOfCommand(action.binding) : toOfLiteral(action.value),
      };
    case 'target_command':
      return {
        do: 'set',
        ...id,
        target: targetV2Of(action.target),
        control: controlOf(action.capability),
        to: 'binding' in action ? toOfCommand(action.binding) : toOfLiteral(action.value),
        ...(action.scale === 'percent' ? { percent: true } : {}),
      };
    case 'temporary_effect':
      return temporaryStepV2Of(action, id);
  }
}

function temporaryStepV2Of(action: Extract<Action, { type: 'temporary_effect' }>, id: Id): StepV2 {
  const { operation } = action;
  return {
    do: 'set',
    ...id,
    target: targetV2Of(action.target),
    control: controlOf(action.capability),
    ...(operation.type === 'set' ? { to: toOfLiteral(operation.value) } : { by: operation.value }),
    for: action.durationMs,
    ...(action.while === undefined ? {} : { while: conditionsV2Of(action.while) }),
    ...(action.priority === 0 ? {} : { priority: action.priority }),
  };
}

function valueStepV2Of(action: Extract<Action, { type: 'value_update' }>, id: Id): StepV2 {
  const change = action.operation.operation;
  return {
    do: 'value',
    ...id,
    value: action.valueId,
    op: change.type,
    ...('value' in change ? { amount: literalOf(change.value) } : {}),
  };
}

function stopStepV2Of(action: Extract<Action, { type: 'stop' }>, id: Id): StepV2 {
  const { target } = action;
  if (target.type === 'current') return { do: 'stop', ...id };
  if (target.type === 'run')
    throw new UnmigratedError('Stopping one particular run has no place in an automation');
  return {
    do: 'stop',
    ...id,
    automation: target.id,
    ...(target.controlKey === undefined ? {} : { key: target.controlKey }),
  };
}

function flowStepV2Of(action: FlowAction, id: Id): StepV2 {
  switch (action.type) {
    case 'choose':
      return {
        do: 'if',
        ...id,
        branches: action.branches.map((branch) => ({
          id: branch.nodeId,
          when: conditionsV2Of(branch.conditions),
          then: stepsV2Of(branch.actions),
        })),
        ...(action.otherwise === undefined ? {} : { else: stepsV2Of(action.otherwise) }),
      };
    case 'repeat':
      return repeatStepV2Of(action, id);
    case 'sequence':
      return {
        do: 'run',
        ...id,
        automation: action.sequenceId,
        ...(Object.keys(action.parameters).length === 0
          ? {}
          : {
              inputs: Object.fromEntries(
                Object.entries(action.parameters).map(([name, input]) => [name, inputV2Of(input)]),
              ),
            }),
        wait: true,
      };
    case 'value_update':
      return valueStepV2Of(action, id);
    case 'stop':
      return stopStepV2Of(action, id);
  }
}

function repeatStepV2Of(action: Extract<StructuredAction, { type: 'repeat' }>, id: Id): StepV2 {
  const { repeat } = action;
  return {
    do: 'repeat',
    ...id,
    ...(repeat.mode === 'count' ? { times: repeat.count } : {}),
    ...(repeat.mode === 'while' ? { while: conditionsV2Of(repeat.conditions) } : {}),
    ...(repeat.mode === 'until' ? { until: conditionsV2Of(repeat.conditions) } : {}),
    gapMs: action.intervalMs,
    limitMs: action.maximumDurationMs,
    steps: stepsV2Of(action.actions),
  };
}

function simpleStepV2Of(action: SimpleAction, id: Id): StepV2 {
  switch (action.type) {
    case 'scene':
      return { do: 'scene', ...id, scene: action.sceneId };
    case 'delay':
      return { do: 'wait', ...id, ms: action.seconds * 1000 };
    case 'notify':
      return { do: 'notify', ...id, message: action.message };
    case 'wake_ai':
      return {
        do: 'ai',
        ...id,
        person: action.profileId,
        ...(action.chatId === null ? {} : { chat: action.chatId }),
        instruction: action.instruction,
      };
    case 'tool':
      return {
        do: 'tool',
        ...id,
        person: action.profileId,
        tool: action.tool,
        ...(Object.keys(action.args).length === 0 ? {} : { args: action.args }),
      };
  }
}

function isDeviceAction(action: Action): action is DeviceAction {
  return (
    action.type === 'command' ||
    action.type === 'target_command' ||
    action.type === 'temporary_effect'
  );
}

function isSimpleAction(action: Action): action is SimpleAction {
  return (
    action.type === 'scene' ||
    action.type === 'delay' ||
    action.type === 'notify' ||
    action.type === 'wake_ai' ||
    action.type === 'tool'
  );
}

function stepV2Of(action: Action): StepV2 {
  const id = idOf(action);
  if (isDeviceAction(action)) return deviceStepV2Of(action, id);
  return isSimpleAction(action) ? simpleStepV2Of(action, id) : flowStepV2Of(action, id);
}

export function stepsV2Of(actions: readonly Action[]): StepV2[] {
  return actions.map(stepV2Of);
}
