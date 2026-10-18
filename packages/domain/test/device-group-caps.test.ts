import { describe, expect, it } from 'vitest';
import { DEVICE_GROUP_INPUT, DEVICE_TARGET, TARGET_CHANGE } from '../src';

const MEMBER_COUNT = 150;

function ids(count: number): readonly string[] {
  return Array.from(
    { length: count },
    (_, index) => `7f000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
  );
}

describe('device group size', () => {
  it('accepts a group with more than a hundred members', () => {
    const input = { name: 'Whole house', device_ids: ids(MEMBER_COUNT) };
    expect(DEVICE_GROUP_INPUT.parse(input).device_ids).toHaveLength(MEMBER_COUNT);
  });

  it('still refuses an empty group and duplicate members', () => {
    expect(DEVICE_GROUP_INPUT.safeParse({ name: 'None', device_ids: [] }).success).toBe(false);
    const [only] = ids(1);
    expect(DEVICE_GROUP_INPUT.safeParse({ name: 'Twice', device_ids: [only, only] }).success).toBe(
      false,
    );
  });

  it('accepts an explicit device selection of more than a hundred devices', () => {
    const target = { kind: 'devices', deviceIds: ids(MEMBER_COUNT) };
    expect(DEVICE_TARGET.parse(target)).toEqual(target);
  });
});

describe('target change scope', () => {
  const base = {
    target: { kind: 'devices', deviceIds: ids(1) },
    capability: 'brightness',
    value: 40,
  };

  it('defaults to every member when scope is omitted', () => {
    expect(TARGET_CHANGE.parse(base).scope).toBeUndefined();
  });

  it.each(['all', 'on'] as const)('accepts scope %s', (scope) => {
    expect(TARGET_CHANGE.parse({ ...base, scope }).scope).toBe(scope);
  });

  it('refuses an unknown scope', () => {
    expect(TARGET_CHANGE.safeParse({ ...base, scope: 'off' }).success).toBe(false);
  });
});
