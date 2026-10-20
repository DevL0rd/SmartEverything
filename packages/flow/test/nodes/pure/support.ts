import { expect } from 'vitest';
import { NODE_REGISTRY } from '@smarteverything/domain';
import type { ErrorClass, JsonValue } from '@smarteverything/domain';
import type { NodeResult, Outputs, PortThunks } from '../../../src/interpret/frames';
import { pureEvaluators } from '../../../src/nodes/pure/index';
import type { PureEnvironment } from '../../../src/nodes/pure/index';

export const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);

export const HOME: PureEnvironment = {
  timeZone: 'Asia/Bangkok',
  now: () => NOW,
  trigger: () => 'press',
};

export type Given = Readonly<Record<string, JsonValue>>;

export function runPorts(
  kind: string,
  names: readonly string[],
  get: PortThunks['get'],
  environment: PureEnvironment = HOME,
): NodeResult {
  const evaluator = pureEvaluators(environment)(kind);
  if (evaluator === undefined) throw new Error(`no evaluator for ${kind}`);
  return evaluator.evaluate({
    kind,
    node: { id: '00000000-0000-4000-8000-000000000001', key: 'n' },
    ports: { names, get },
  });
}

export function run(kind: string, given: Given, environment: PureEnvironment = HOME): NodeResult {
  return runPorts(
    kind,
    Object.keys(given),
    (name) => {
      const value = given[name];
      return value === undefined ? undefined : { ok: true, value };
    },
    environment,
  );
}

export function good(kind: string, given: Given, environment: PureEnvironment = HOME): Outputs {
  const result = run(kind, given, environment);
  if (!result.ok) throw new Error(`${kind} failed: ${result.class} ${result.message}`);
  const declared = NODE_REGISTRY.get(kind)?.outputs.map((port) => port.name) ?? [];
  for (const name of Object.keys(result.value)) expect(declared).toContain(name);
  return result.value;
}

export function bad(
  kind: string,
  given: Given,
  errorClass: ErrorClass,
  environment: PureEnvironment = HOME,
): string {
  const result = run(kind, given, environment);
  if (result.ok)
    throw new Error(`${kind} should have failed, gave ${JSON.stringify(result.value)}`);
  expect(result.class).toBe(errorClass);
  return result.message;
}
