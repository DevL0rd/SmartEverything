import {
  HSV_COLOR,
  type AccessMode,
  type HsvColor,
  type JsonValue,
  type StandardCapability,
  type ValueDescriptor,
} from '@smarteverything/domain';
import { SmartThingsCommandError } from './errors';
import type { ComponentStatus } from './rest-schemas';

export interface CommandCall {
  readonly capability: string;
  readonly command: string;
  readonly arguments?: readonly JsonValue[];
}

export interface AttributeSource {
  readonly capability: string;
  readonly attribute: string;
}

export interface ComponentView {
  readonly id: string;
  readonly capabilities: ReadonlySet<string>;
  readonly status: ComponentStatus;
}

export type ReadValue = (status: ComponentStatus) => JsonValue | undefined;

type WriteValue = (value: JsonValue) => readonly CommandCall[];

export interface StandardMapping {
  readonly key: StandardCapability;
  readonly access: AccessMode;
  readonly value: ValueDescriptor;
  readonly sources: readonly AttributeSource[];
  readonly read: ReadValue;
  readonly write: WriteValue | null;
}

export interface CapabilityMapper {
  readonly capability: string;
  readonly attributes: readonly string[];
  readonly commands: readonly string[];
  readonly map: (view: ComponentView) => readonly StandardMapping[];
}

export function attributeValue(
  status: ComponentStatus,
  capability: string,
  attribute: string,
): JsonValue | undefined {
  const value = status[capability]?.[attribute]?.value;
  return value === null ? undefined : value;
}

export function attributeUnit(
  status: ComponentStatus,
  capability: string,
  attribute: string,
): string | null {
  return status[capability]?.[attribute]?.unit ?? null;
}

export function isJsonRecord(
  value: JsonValue | undefined,
): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonList(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

export function stringList(value: JsonValue | undefined): readonly string[] {
  if (!isJsonList(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry !== '');
}

export function call(
  capability: string,
  command: string,
  args?: readonly JsonValue[],
): CommandCall {
  return args === undefined ? { capability, command } : { capability, command, arguments: args };
}

export function numberOf(capability: string, value: JsonValue): number {
  if (typeof value !== 'number') {
    throw new SmartThingsCommandError(capability, value, 'expected a number');
  }
  return value;
}

export function booleanOf(capability: string, value: JsonValue): boolean {
  if (typeof value !== 'boolean') {
    throw new SmartThingsCommandError(capability, value, 'expected true or false');
  }
  return value;
}

export function stringOf(capability: string, value: JsonValue): string {
  if (typeof value !== 'string') {
    throw new SmartThingsCommandError(capability, value, 'expected text');
  }
  return value;
}

export function colorOf(capability: string, value: JsonValue): HsvColor {
  const parsed = HSV_COLOR.safeParse(value);
  if (!parsed.success) {
    throw new SmartThingsCommandError(capability, value, 'expected a hue, saturation and value');
  }
  return parsed.data;
}

export function finiteNumber(value: JsonValue | undefined): number | undefined {
  return Number.isFinite(value) ? Number(value) : undefined;
}

export function readNumber(capability: string, attribute: string): ReadValue {
  return (status) => finiteNumber(attributeValue(status, capability, attribute));
}

export function readEquals(
  capability: string,
  attribute: string,
  truthy: readonly string[],
): ReadValue {
  return (status) => {
    const value = attributeValue(status, capability, attribute);
    return typeof value === 'string' ? truthy.includes(value) : undefined;
  };
}

export function readString(capability: string, attribute: string): ReadValue {
  return (status) => {
    const value = attributeValue(status, capability, attribute);
    return typeof value === 'string' ? value : undefined;
  };
}
