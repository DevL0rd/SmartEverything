import { JSON_VALUE } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import type { Checked, Env, ReadRequest } from './frames';
import { keptFor } from './step';

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
