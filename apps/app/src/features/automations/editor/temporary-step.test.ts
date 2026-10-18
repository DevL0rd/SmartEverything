import { describe, expect, it } from 'vitest';
import { STEP_V2, type StepV2 } from '@smarteverything/domain';
import { LAMP } from '../model/test-devices';
import { withTemporary } from './temporary-step';

type SetStep = Extract<StepV2, { do: 'set' }>;

const FALLBACK = 50;

describe('withTemporary', () => {
  it('turning For a while off after Change by restores a valid Set to step', () => {
    const changing: SetStep = {
      do: 'set',
      target: { device: LAMP },
      control: 'brightness',
      by: 1,
      for: 600_000,
      priority: 2,
    };
    const result = withTemporary(changing, {}, FALLBACK);
    expect(result).toEqual({
      do: 'set',
      target: { device: LAMP },
      control: 'brightness',
      to: FALLBACK,
    });
    expect(STEP_V2.safeParse(result).success).toBe(true);
  });

  it('keeps the chosen value when turning For a while off after Set to', () => {
    const setting: SetStep = {
      do: 'set',
      target: { device: LAMP },
      control: 'brightness',
      to: 20,
      for: 600_000,
    };
    expect(withTemporary(setting, {}, FALLBACK)).toEqual({
      do: 'set',
      target: { device: LAMP },
      control: 'brightness',
      to: 20,
    });
  });

  it('turning it on adds the duration and keeps the value', () => {
    const plain: SetStep = { do: 'set', target: { device: LAMP }, control: 'brightness', to: 20 };
    expect(withTemporary(plain, { for: 600_000 }, FALLBACK)).toEqual({ ...plain, for: 600_000 });
  });
});
