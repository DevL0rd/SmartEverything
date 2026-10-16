import { effectMembers } from './temporary-effect';
import { validateCommandInput } from './validate-command-input';
import { validateTargetCommand } from './validate-target-command';
import { validateInput } from './validate-bindings';
import {
  ApiError,
  AUTOMATION_CHOICE_ID,
  capabilityOf,
  type Action,
  type AutomationInput,
  type AutomationSequenceDefinition,
  type SequenceParameter,
  type Conditions,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { automationProgram, programActions } from './program';

function inputsOf(action: Action): readonly AutomationInput[] {
  if (action.type === 'sequence') return Object.values(action.parameters);
  if (!['command', 'target_command'].includes(action.type) || !('binding' in action)) return [];
  return action.binding.type === 'value'
    ? [action.binding.input]
    : Object.values(action.binding.fields);
}
function validateAction(
  store: Store,
  action: Action,
  parameters: readonly SequenceParameter[],
): void {
  for (const input of inputsOf(action)) validateInput(store, input, parameters);
  if (action.type === 'target_command') validateTargetCommand(store, action);
  validateTemporary(store, action, parameters);
  if (action.type === 'value_update') validateValueOperation(store, action);
  if (action.type === 'choose')
    for (const branch of action.branches)
      validateValueConditions(store, branch.conditions, parameters);
  if (action.type === 'repeat' && action.repeat.mode !== 'count')
    validateValueConditions(store, action.repeat.conditions, parameters);
  if (action.type === 'command' && 'binding' in action) validateCommandBinding(store, action);
}
function validateTemporary(
  store: Store,
  action: Action,
  parameters: readonly SequenceParameter[],
): void {
  if (action.type !== 'temporary_effect') return;
  if (effectMembers(store, action).members.length === 0)
    throw new ApiError('invalid_request', 'No target device supports this temporary change.');
  if (action.while !== undefined) validateValueConditions(store, action.while, parameters);
}
export function validateCommandBinding(
  store: Store,
  action: Extract<Action, { type: 'command' }>,
): void {
  if (!('binding' in action)) return;
  const target = capabilityOf(store.devices.byId(action.deviceId), action.capability);
  if (target === undefined || target.access === 'read')
    throw new ApiError('invalid_request', 'Bound command needs a writable device capability.');
  validateCommandInput(target.value, action.binding);
}

export function validateAutomationProgram(
  store: Store,
  actions: readonly Action[],
  sequence?: { readonly id?: string; readonly definition: AutomationSequenceDefinition },
): readonly Action[] {
  const program = automationProgram(store, actions, sequence?.id);
  for (const action of programActions({ actions, sequences: new Map() }))
    validateAction(store, action, sequence?.definition.parameters ?? []);
  for (const referenced of program.sequences.values()) {
    for (const action of programActions({
      actions: referenced.definition.actions,
      sequences: new Map(),
    }))
      validateAction(store, action, referenced.definition.parameters);
  }
  return programActions(program);
}

function validateValueOperation(
  store: Store,
  action: Extract<Action, { type: 'value_update' }>,
): void {
  const content = store.automationValues.byId(action.valueId).content;
  if (content.kind !== action.operation.kind)
    throw new ApiError('invalid_request', 'Value operation kind does not match.');
  if (
    content.kind === 'choice' &&
    action.operation.kind === 'choice' &&
    action.operation.operation.type === 'set'
  ) {
    const id = AUTOMATION_CHOICE_ID.parse(action.operation.operation.value);
    if (!content.choices.some((entry) => entry.id === id))
      throw new ApiError('invalid_request', 'Selected Value choice does not exist.');
  }
}

export function validateValueConditions(
  store: Store,
  conditions: Conditions,
  parameters: readonly SequenceParameter[] = [],
): void {
  for (const condition of conditions.items) {
    if (condition.type === 'value') store.automationValues.byId(condition.valueId);
    if (condition.type === 'binding') validateInput(store, condition.input, parameters);
  }
}
