import type {
  AutomationBinding,
  AutomationCommandInput,
  AutomationInput,
} from '../../src/automation-bindings';
import type { Comparison } from '../../src/comparison';
import type { Condition, Conditions } from '../../src/automation-conditions';
import type { DeviceTarget } from '../../src/device-targets';
import type { JsonValue } from '../../src/values';
import { changeText, fieldsText, isRecord, sortedDays, stable, targetText } from './outline-text';

export function comparisonText(comparison: Comparison): string {
  if (comparison.operator === 'changed') return 'changed';
  if (comparison.operator === 'between')
    return `between ${String(comparison.min)} ${String(comparison.max)}`;
  return `${comparison.operator} ${stable(comparison.value)}`;
}

function bindingText(binding: AutomationBinding): string {
  switch (binding.source) {
    case 'literal':
      return `literal:${stable(binding.value)}`;
    case 'value':
      return `value:${binding.valueId}`;
    case 'parameter':
      return `input:${binding.name}`;
    case 'capability':
      return `device:${binding.deviceId}:${binding.capability}`;
  }
}

export function inputTextV1(input: AutomationInput): string {
  const { offset } = input;
  if (offset === undefined) return bindingText(input.binding);
  const add = offset.operation === 'add' ? offset.amount : -offset.amount;
  const floor =
    input.binding.kind === 'duration' ? Math.max(offset.minimum ?? 0, 0) : offset.minimum;
  return bindingText(input.binding) + changeText(add, floor, offset.maximum);
}

export function literalTextV1(value: JsonValue): string {
  if (!isRecord(value) || 'from' in value) return `literal:${stable(value)}`;
  return fieldsText(
    Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, `literal:${stable(entry)}`]),
    ),
  );
}

export function commandTextV1(input: AutomationCommandInput): string {
  if (input.type === 'fields')
    return fieldsText(
      Object.fromEntries(
        Object.entries(input.fields).map(([key, field]) => [key, inputTextV1(field)]),
      ),
    );
  const { binding, offset } = input.input;
  return binding.source === 'literal' && offset === undefined
    ? literalTextV1(binding.value)
    : inputTextV1(input.input);
}

export function targetTextV1(target: DeviceTarget): string {
  switch (target.kind) {
    case 'room':
      return targetText('room', [target.roomId], target.families);
    case 'group':
      return targetText('group', [target.groupId]);
    case 'devices':
      return targetText('devices', target.deviceIds);
  }
}

function conditionTextV1(condition: Condition): string {
  switch (condition.type) {
    case 'state':
      return `compare device:${condition.deviceId}:${condition.capability} ${comparisonText(condition.comparison)}`;
    case 'time_window':
      return `time ${condition.after}-${condition.before} days *`;
    case 'weekday':
      return `time *-* days ${sortedDays(condition.weekdays)}`;
    case 'weather':
      return `compare weather:${condition.metric} ${comparisonText(condition.comparison)}`;
    case 'weather_kind':
      return `compare weather:kind in ${stable(condition.kinds)}`;
    case 'daylight':
      return `daylight ${condition.is} ${String(condition.sunriseOffsetMinutes)} ${String(condition.sunsetOffsetMinutes)}`;
    case 'value':
      return `compare value:${condition.valueId} ${comparisonText(condition.comparison)}`;
    case 'binding':
      return `compare ${inputTextV1(condition.input)} ${comparisonText(condition.comparison)}`;
  }
}

export function conditionsTextV1(conditions: Conditions): string {
  return `${conditions.mode}(${conditions.items.map(conditionTextV1).join('; ')})`;
}
