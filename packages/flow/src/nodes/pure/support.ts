import { NODE_REGISTRY } from '@smarteverything/domain';
import type { ErrorClass, JsonValue } from '@smarteverything/domain';
import type { NodeResult, Outputs, PureEvaluator, PureRequest } from '../../interpret/frames';

export interface PureEnvironment {
  readonly timeZone: string;
  readonly now: () => number;
  readonly trigger: () => string | null;
}

export type JsonList = readonly JsonValue[];

export type JsonRecord = Readonly<Record<string, JsonValue>>;

export class PureFailure extends Error {
  constructor(
    readonly errorClass: ErrorClass,
    message: string,
  ) {
    super(message);
  }
}

export function fail(errorClass: ErrorClass, message: string): never {
  throw new PureFailure(errorClass, message);
}

export function isList(value: JsonValue | undefined): value is JsonList {
  return Array.isArray(value);
}

export function isRecord(value: JsonValue | undefined): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNumber(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isText(value: JsonValue | undefined): value is string {
  return typeof value === 'string';
}

export function isFlag(value: JsonValue | undefined): value is boolean {
  return typeof value === 'boolean';
}

export function describe(value: JsonValue | undefined): string {
  return value === undefined ? 'nothing' : JSON.stringify(value);
}

export function mismatch(label: string, expected: string, value: JsonValue | undefined): never {
  return fail('TypeError', `${label} must be ${expected}, received ${describe(value)}`);
}

type Guard<T extends JsonValue> = (value: JsonValue | undefined) => value is T;

export interface Ports {
  readonly kind: string;
  readonly raw: (name: string) => JsonValue | undefined;
  readonly given: (name: string) => boolean;
  readonly need: (name: string) => JsonValue;
  readonly number: (name: string) => number;
  readonly maybeNumber: (name: string) => number | undefined;
  readonly text: (name: string) => string;
  readonly maybeText: (name: string) => string | undefined;
  readonly flag: (name: string) => boolean;
  readonly list: (name: string) => JsonList;
  readonly record: (name: string) => JsonRecord;
}

function declaredDefault(kind: string, name: string): JsonValue | undefined {
  return NODE_REGISTRY.get(kind)?.inputs.find((port) => port.name === name)?.default;
}

export function readPorts(request: PureRequest): Ports {
  const { kind } = request;
  const raw = (name: string): JsonValue | undefined => {
    const got = request.ports.get(name);
    if (got !== undefined && !got.ok) return fail(got.class, got.message);
    return got?.value === undefined ? declaredDefault(kind, name) : got.value;
  };
  const need = (name: string): JsonValue => {
    const value = raw(name);
    return value === undefined ? fail('Invalid', `${kind} needs a value for ${name}`) : value;
  };
  const typed = <T extends JsonValue>(name: string, expected: string, guard: Guard<T>): T => {
    const value = need(name);
    return guard(value) ? value : mismatch(name, expected, value);
  };
  const maybe = <T extends JsonValue>(
    name: string,
    expected: string,
    guard: Guard<T>,
  ): T | undefined => {
    const value = raw(name);
    if (value === undefined || value === null) return undefined;
    return guard(value) ? value : mismatch(name, expected, value);
  };
  return {
    kind,
    raw,
    given: (name) => raw(name) !== undefined,
    need,
    number: (name) => typed(name, 'a number', isNumber),
    maybeNumber: (name) => maybe(name, 'a number', isNumber),
    text: (name) => typed(name, 'text', isText),
    maybeText: (name) => maybe(name, 'text', isText),
    flag: (name) => typed(name, 'true or false', isFlag),
    list: (name) => typed(name, 'a list', isList),
    record: (name) => typed(name, 'a record', isRecord),
  };
}

export type PureBody = (ports: Ports, environment: PureEnvironment) => Outputs;

export type PureBodies = Readonly<Record<string, PureBody>>;

export function evaluatorOf(body: PureBody, environment: PureEnvironment): PureEvaluator {
  return {
    evaluate: (request): NodeResult => {
      try {
        return { ok: true, value: body(readPorts(request), environment) };
      } catch (error) {
        if (error instanceof PureFailure) {
          return { ok: false, class: error.errorClass, message: error.message };
        }
        throw error;
      }
    },
  };
}

export function outputs(values: Readonly<Record<string, JsonValue | undefined>>): Outputs {
  const result: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) result[name] = value;
  }
  return result;
}

export function single(name: string, value: JsonValue | undefined): Outputs {
  return value === undefined ? {} : { [name]: value };
}

export function numbersOf(values: JsonList, label: string): readonly number[] {
  return values.map((value, index) =>
    isNumber(value) ? value : mismatch(`${label} item ${String(index + 1)}`, 'a number', value),
  );
}

export function finite(value: number, operation: string): number {
  return Number.isFinite(value) ? value : fail('MathError', `${operation} has no finite result`);
}

export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
