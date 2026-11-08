import { MODEL_SPEC, type ModelSpec, type ModelSpecChannel } from '@smarteverything/domain';
import { expect } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';

export function channelOf(spec: ModelSpec, id: string): ModelSpecChannel {
  const found = spec.channels?.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`${spec.id} has no channel ${id}`);
  return found;
}

export function tableOf(spec: ModelSpec, id: string): Readonly<Record<string, unknown>> {
  const { map } = channelOf(spec, id);
  if (map.type !== 'enum') throw new Error(`${id} is not an enum map`);
  return map.table;
}

export function expectValidAndRegistered(spec: ModelSpec): void {
  expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
  expect(checkAuthoring(spec).problems).toStrictEqual([]);
  expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
  expect(Object.keys(spec.states ?? {})).toEqual(expect.arrayContaining(['offline']));
  expect(spec.anchors?.some((anchor) => anchor.kind === 'mount')).toBe(true);
}

export function expectStillWhenIdle(
  spec: ModelSpec,
  idle: Readonly<Record<string, string | number | boolean | null>>,
): void {
  for (const channel of spec.channels ?? []) {
    if (channel.motion.type === 'pose') continue;
    if (typeof channel.source !== 'string' || channel.map.type !== 'enum') continue;
    const value = idle[channel.source];
    if (value === undefined) continue;
    expect(Object.hasOwn(channel.map.table, String(value)), `${channel.id} moves while idle`).toBe(
      false,
    );
  }
}
