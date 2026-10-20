import type { FlowType } from '@smarteverything/domain';
import { EXPLICIT_CONVERSIONS, conversionsOffered } from '@smarteverything/domain';

export function own<T>(
  record: Readonly<Record<string, T>> | undefined,
  name: string,
): T | undefined {
  return record !== undefined && Object.hasOwn(record, name) ? record[name] : undefined;
}

export function mapValues<A, B>(
  record: Readonly<Record<string, A>>,
  convert: (value: A) => B,
): Record<string, B> {
  return Object.fromEntries(Object.entries(record).map(([name, value]) => [name, convert(value)]));
}

export function optionalIf(flag: boolean, type: FlowType): FlowType {
  return flag && type.t !== 'optional' ? { t: 'optional', of: type } : type;
}

export function conversionFix(from: FlowType, to: FlowType): string | undefined {
  const [first] = conversionsOffered(from, to);
  return EXPLICIT_CONVERSIONS.find((conversion) => conversion.id === first)?.label;
}
