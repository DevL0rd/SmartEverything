import { JSON_VALUE } from '@smarteverything/domain';
import type { JsonValue, Variable } from '@smarteverything/domain';
import { instanceOf } from './calls';
import type { Checked, Env, ReadRequest } from './frames';
import type { KeptScope, KeptStart } from './kept-types';
import { evaluate } from './step';

export function keptScope(env: Env, variable: Variable): KeptScope | undefined {
  if (variable.persist !== true) return undefined;
  const instance = instanceOf(env.state);
  return instance === '' ? undefined : { instance, type: variable.type };
}

export function keptStart(env: Env, variable: Variable): Checked<JsonValue> {
  const initial = evaluate(env, variable.initial);
  if (!initial.ok) return initial;
  return initial.value === undefined
    ? { ok: false, class: 'Invalid', message: `the start value of ${variable.name} is absent` }
    : { ok: true, value: initial.value };
}

export function keptFor(env: Env, name: string): Checked<KeptStart | undefined> {
  const variable = env.plan.variables.find((held) => held.name === name);
  const scope = variable === undefined ? undefined : keptScope(env, variable);
  if (variable === undefined || scope === undefined) return { ok: true, value: undefined };
  const start = keptStart(env, variable);
  return start.ok ? { ok: true, value: { ...scope, start: start.value } } : start;
}

export function keptParams(env: Env, target: string): Checked<Readonly<Record<string, JsonValue>>> {
  const kept = keptFor(env, target);
  if (!kept.ok) return kept;
  if (kept.value === undefined) return { ok: true, value: {} };
  const { instance, type, start } = kept.value;
  return { ok: true, value: { instance, type: JSON_VALUE.parse(type), initial: start } };
}

export const AUTOMATION_LEVEL: Pick<ReadRequest, 'instance' | 'kept'> = {
  instance: '',
  kept: () => ({ ok: true, value: undefined }),
};
