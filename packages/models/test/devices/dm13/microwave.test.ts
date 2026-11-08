import { MODEL_SPEC, specSignalProblems } from '@smarteverything/domain';
import { SAMSUNG_MICROWAVE_MODEL as MICROWAVE } from '@smarteverything/smartthings';
import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';

function channel(id: string): NonNullable<typeof MICROWAVE.channels>[number] {
  const found = MICROWAVE.channels?.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no channel ${id}`);
  return found;
}

function tableOf(id: string): Readonly<Record<string, unknown>> {
  const { map } = channel(id);
  if (map.type !== 'enum') throw new Error(`${id} is not an enum map`);
  return map.table;
}

describe('Samsung smart microwave model', () => {
  it('parses strictly and passes every authoring check', () => {
    expect(MODEL_SPEC.safeParse(MICROWAVE).success).toBe(true);
    expect(specSignalProblems(MICROWAVE)).toStrictEqual([]);
    expect(checkAuthoring(MICROWAVE).problems).toStrictEqual([]);
  });

  it('turns the plate and lights the cavity only while running', () => {
    expect(tableOf('plateTurn')).toStrictEqual({ idle: 0, running: 0.1, paused: 0, finished: 0 });
    expect(tableOf('glowLit')).toStrictEqual({ idle: 0, running: 1.4, paused: 0.4, finished: 0 });
    expect(channel('plateTurn').motion).toStrictEqual({ type: 'spin' });
  });

  it('swings the door open on its left hinge and keeps it shut when locked', () => {
    const door = MICROWAVE.parts.find((part) => part.id === 'door');
    expect(Object.keys(door?.poses ?? {})).toStrictEqual(['closed', 'open']);
    expect(door?.poses?.['open']?.rotation).toStrictEqual([0, -100, 0]);
    expect(tableOf('doorPose')).toStrictEqual({ open: 'open', closed: 'closed', locked: 'closed' });
  });

  it('loops the cooking shot on whole turns of the three-rib plate', () => {
    const [shot] = MICROWAVE.shots ?? [];
    expect(shot?.focus).toBe('window');
    expect(shot?.symmetry).toBe(120);
    expect((shot?.loopS ?? 0) * 0.1).toBe(1);
  });
});
