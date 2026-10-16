import {
  humanizeEnum,
  type Action,
  type AutomationInput,
  type AutomationBinding,
  type AutomationBindingKind,
  type Condition,
  type JsonValue,
  type DeviceTarget,
  type StructuredAction,
} from '@smarteverything/domain';
import { duration } from '../../../format/time';
import { COMPARISON_WORDS } from './signal-text';
import type { Names } from './describe';

function valueName(names: Names, id: string): string {
  return names.values?.find((row) => row.id === id)?.content.name ?? 'a removed Value';
}
function sequenceName(names: Names, id: string): string {
  return names.sequences?.find((row) => row.id === id)?.name ?? 'a removed sequence';
}
function deviceName(names: Names, id: string): string {
  return names.devices.find((row) => row.id === id)?.label ?? 'a removed device';
}
function choosePhrase(action: Extract<Action, { type: 'choose' }>): string {
  return `choose the first matching branch of ${String(action.branches.length)}${action.otherwise === undefined ? '' : ', otherwise use the fallback steps'}`;
}

function bindingPhrase(names: Names, binding: AutomationBinding): string {
  switch (binding.source) {
    case 'literal':
      return operandPhrase(names, binding.kind, binding.value);
    case 'value':
      return valueName(names, binding.valueId);
    case 'parameter':
      return `parameter “${binding.name}”`;
    case 'capability':
      return `${deviceName(names, binding.deviceId)} ${humanizeEnum(binding.capability)}`;
  }
}
export function inputPhrase(names: Names, input: AutomationInput): string {
  const base = bindingPhrase(names, input.binding);
  const offset = input.offset;
  if (offset === undefined) return base;
  const amount =
    offset.unit === 'milliseconds' ? `${String(offset.amount)} ms` : String(offset.amount);
  const minimum = offset.minimum === undefined ? '' : `, minimum ${String(offset.minimum)}`;
  const maximum = offset.maximum === undefined ? '' : `, maximum ${String(offset.maximum)}`;
  return `${base} ${offset.operation === 'add' ? 'plus' : 'minus'} ${amount}${minimum}${maximum}`;
}
function choiceLabel(names: Names, value: JsonValue): string {
  return (
    names.values
      ?.flatMap((row) => (row.content.kind === 'choice' ? row.content.choices : []))
      .find((choice) => choice.id === value)?.label ?? 'a removed choice'
  );
}
function operandPhrase(names: Names, kind: AutomationBindingKind, value: JsonValue): string {
  if (kind === 'choice') return choiceLabel(names, value);
  if (kind === 'boolean' && typeof value === 'boolean') return value ? 'On' : 'Off';
  if (kind === 'duration' && typeof value === 'number') return `${String(value)} ms`;
  return typeof value === 'string' ? `“${value}”` : JSON.stringify(value);
}
export function typedConditionPhrase(
  names: Names,
  condition: Extract<Condition, { type: 'binding' | 'value' }>,
): string {
  const remembered =
    condition.type === 'value'
      ? names.values?.find((row) => row.id === condition.valueId)
      : undefined;
  const kind =
    condition.type === 'binding'
      ? condition.input.binding.kind
      : (remembered?.content.kind ?? 'string');
  const subject =
    condition.type === 'binding'
      ? inputPhrase(names, condition.input)
      : valueName(names, condition.valueId);
  const { comparison } = condition;
  if (comparison.operator === 'between')
    return `${subject} is between ${operandPhrase(names, kind, comparison.min)} and ${operandPhrase(names, kind, comparison.max)}`;
  return `${subject} ${COMPARISON_WORDS[comparison.operator][1]} ${operandPhrase(names, kind, comparison.value)}`;
}
function targetPhrase(names: Names, target: DeviceTarget): string {
  switch (target.kind) {
    case 'group':
      return names.groups?.find((row) => row.id === target.groupId)?.name ?? 'a removed group';
    case 'room':
      return names.rooms?.find((row) => row.id === target.roomId)?.name ?? 'a removed room';
    case 'devices':
      return target.deviceIds
        .map((id) => names.devices.find((row) => row.id === id)?.label ?? 'a removed device')
        .join(', ');
  }
}
function targetCommandPhrase(
  names: Names,
  action: Extract<Action, { type: 'target_command' }>,
): string {
  const input =
    'binding' in action && action.binding.type === 'value'
      ? ` from ${inputPhrase(names, action.binding.input)}`
      : '';
  return `set ${humanizeEnum(action.capability)} on ${targetPhrase(names, action.target)}${input}`;
}
function repeatPhrase(action: Extract<Action, { type: 'repeat' }>): string {
  const count =
    action.repeat.mode === 'count' ? `${String(action.repeat.count)} times` : action.repeat.mode;
  return `repeat ${count}, for at most ${duration(action.maximumDurationMs / 1000)}`;
}
function stopPhrase(names: Names, action: Extract<Action, { type: 'stop' }>): string {
  const { target } = action;
  if (target.type === 'current') return 'stop this run';
  if (target.type === 'sequence')
    return `stop ${names.sequences?.find((row) => row.id === target.id)?.name ?? 'a removed sequence'}`;
  if (target.type === 'automation')
    return `stop ${names.automations?.find((row) => row.id === target.id)?.name ?? 'a removed automation'}`;
  return 'stop the selected run';
}
export function programActionPhrase(
  names: Names,
  action: Exclude<StructuredAction, { type: 'command' }>,
): string {
  switch (action.type) {
    case 'temporary_effect':
      return `temporarily ${action.operation.type} ${action.capability} for ${duration(action.durationMs / 1000)}`;
    case 'target_command':
      return targetCommandPhrase(names, action);
    case 'choose':
      return choosePhrase(action);
    case 'repeat':
      return repeatPhrase(action);
    case 'sequence':
      return `run ${sequenceName(names, action.sequenceId)}`;
    case 'value_update':
      return `${humanizeEnum(action.operation.operation.type)} ${valueName(names, action.valueId)}`;
    case 'stop':
      return stopPhrase(names, action);
  }
}
