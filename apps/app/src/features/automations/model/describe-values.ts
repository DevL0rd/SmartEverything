import type { JsonValue, OperandV2 } from '@smarteverything/domain';
import { duration } from '../../../format/time';
import type { Names } from './describe-names';
import type { Kind } from './inputs';
import { subjectOf, subjectValue } from './present';

const MS_PER_SECOND = 1000;

export function durationText(ms: number): string {
  return ms < MS_PER_SECOND ? `${String(ms)} ms` : duration(ms / MS_PER_SECOND);
}

function choiceLabel(names: Names, value: JsonValue): string {
  return (
    names.values
      ?.flatMap((row) => (row.content.kind === 'choice' ? row.content.choices : []))
      .find((choice) => choice.id === value)?.label ?? 'a removed choice'
  );
}

export function literalText(names: Names, kind: Kind | null, value: JsonValue): string {
  if (kind === 'choice') return choiceLabel(names, value);
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (kind === 'duration' && typeof value === 'number') return durationText(value);
  return typeof value === 'string' ? `“${value}”` : JSON.stringify(value);
}

export function operandValueText(names: Names, operand: OperandV2, value: JsonValue): string {
  if ('device' in operand)
    return subjectValue(subjectOf(names.devices, operand.device, operand.control), value);
  if ('value' in operand) {
    const row = names.values?.find((entry) => entry.id === operand.value);
    const kind: Kind | null =
      row === undefined ? null : row.content.kind === 'boolean' ? 'flag' : row.content.kind;
    return literalText(names, kind, value);
  }
  return literalText(names, null, value);
}
