import type {
  ConditionV2,
  FromV2,
  InputV2,
  OperandV2,
  StepV2,
  ToV2,
  TriggerTestV2,
} from '../../src/automation-v2-schema';
import { changeText, fieldsText, isRecord, sortedDays, stable, targetText } from './outline-text';

function isFromV2(value: InputV2 | ToV2): value is FromV2 {
  return isRecord(value) && 'from' in value;
}

function operandText(operand: OperandV2): string {
  if ('device' in operand) return `device:${operand.device}:${operand.control}`;
  if ('value' in operand) return `value:${operand.value}`;
  if ('input' in operand) return `input:${operand.input}`;
  if ('weather' in operand) return `weather:${operand.weather}`;
  return `literal:${stable(operand.literal)}`;
}

function fromText(from: FromV2): string {
  return operandText(from.from) + changeText(from.add, from.min, from.max);
}

export function inputTextV2(input: InputV2): string {
  return isFromV2(input) ? fromText(input) : `literal:${stable(input)}`;
}

export function toTextV2(to: ToV2): string {
  if (isFromV2(to) || !isRecord(to)) return inputTextV2(to);
  return fieldsText(
    Object.fromEntries(Object.entries(to).map(([key, entry]) => [key, inputTextV2(entry)])),
  );
}

export function testText(test: TriggerTestV2): string {
  if (test.is === 'changed') return 'changed';
  if (test.is === 'between') return `between ${String(test.min)} ${String(test.max)}`;
  return `${test.is} ${stable(test.to)}`;
}

function timeText(time: Extract<ConditionV2, { time: unknown }>['time']): string {
  const days = time.days === undefined ? '*' : sortedDays(time.days);
  return `time ${time.after ?? '*'}-${time.before ?? '*'} days ${days}`;
}

export function conditionTextV2(condition: ConditionV2): string {
  if ('all' in condition) return `all(${condition.all.map(conditionTextV2).join('; ')})`;
  if ('any' in condition) return `any(${condition.any.map(conditionTextV2).join('; ')})`;
  if ('not' in condition) return `not(${conditionTextV2(condition.not)})`;
  if ('time' in condition) return timeText(condition.time);
  if ('daylight' in condition)
    return `daylight ${condition.daylight} ${String(condition.sunriseOffset ?? 0)} ${String(condition.sunsetOffset ?? 0)}`;
  const { compare, test } = condition;
  const subject = 'from' in compare ? fromText(compare) : operandText(compare);
  return `compare ${subject} ${testText(test)}`;
}

export function targetTextV2(target: Extract<StepV2, { do: 'set' }>['target']): string {
  if ('device' in target) return targetText('device', [target.device]);
  if ('devices' in target) return targetText('devices', target.devices);
  if ('group' in target) return targetText('group', [target.group]);
  return targetText('room', [target.room], target.families);
}
