import { describe, expect, it } from 'vitest';
import {
  BODY_READING_ROW,
  PROFILE_ROW,
  UNSET_FITNESS_GOALS,
  type BodyReadingRow,
  type ProfileRow,
} from '@smarteverything/domain';
import { NO_SLOT, slotChoices, slotOf } from './scale-slots';

const MOMENT = '2026-10-16T08:00:00.000Z';
const ID = (n: number): string => `00000000-0000-4000-8000-00000000000${String(n)}`;

function profile(n: number, name: string, scaleUser: number | null): ProfileRow {
  return PROFILE_ROW.parse({
    id: ID(n),
    name,
    colour: 'aqua',
    sex: null,
    birth_date: null,
    height_cm: null,
    scale_user: scaleUser,
    fitness_goals: UNSET_FITNESS_GOALS,
    max_heart_rate: null,
    position: n,
    created_at: MOMENT,
    updated_at: MOMENT,
  });
}

function reading(n: number, slot: number | null, kg: number, at: string): BodyReadingRow {
  return BODY_READING_ROW.parse({
    id: ID(n),
    device_id: ID(9),
    profile_id: null,
    measured_at: at,
    weight_kg: kg,
    impedance_low: null,
    impedance_high: null,
    heart_rate: null,
    scale_user: slot,
    attribution: 'pending',
    bmi: null,
    composition: null,
    version: 1,
    saved_to_health_connect_at: null,
    created_at: MOMENT,
    updated_at: MOMENT,
  });
}

describe('scale slot choices', () => {
  it('offers not linked first, then every slot the scale has reported with its latest weight and holder', () => {
    const choices = slotChoices(
      [
        reading(1, 2, 60, '2026-10-10T08:00:00.000Z'),
        reading(2, 2, 61, '2026-10-12T08:00:00.000Z'),
        reading(3, 1, 80, '2026-10-11T08:00:00.000Z'),
        reading(4, null, 70, '2026-10-11T08:00:00.000Z'),
      ],
      [profile(1, 'Ada', 1), profile(2, 'Bob', null)],
      null,
    );
    expect(choices.map((choice) => choice.value)).toStrictEqual([NO_SLOT, '1', '2']);
    expect(choices[1]?.description).toBe('last 80 kg, now Ada');
    expect(choices[2]?.description).toBe('last 61 kg');
  });

  it('keeps a linked slot that has no readings yet', () => {
    const choices = slotChoices([], [profile(1, 'Ada', 7)], 7);
    expect(choices.map((choice) => choice.value)).toStrictEqual([NO_SLOT, '7']);
  });

  it('turns a choice back into a slot number or none', () => {
    expect(slotOf(NO_SLOT)).toBeNull();
    expect(slotOf('3')).toBe(3);
  });
});
