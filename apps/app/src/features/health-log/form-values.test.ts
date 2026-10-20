import { describe, expect, it } from 'vitest';
import { HEALTH_ENTRY_INPUT, type HealthEntryRow } from '@smarteverything/domain';
import { LOG_FORMS, logFormOf, type LogForm } from './forms';
import { entryOfForm, initialTime, initialValues } from './form-values';

const NOW = Date.parse('2026-10-16T12:00:00Z');

function formOf(type: string): LogForm {
  const form = logFormOf(type);
  if (form === null) {
    throw new Error(`no ${type} form`);
  }
  return form;
}

function rowOf(form: LogForm, data: Record<string, unknown>, end: string | null): HealthEntryRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    profile_id: '00000000-0000-4000-8000-000000000002',
    record_type: form.type,
    start_time: '2026-10-16T10:00:00.000Z',
    end_time: end,
    zone_offset_seconds: 0,
    data,
    food: null,
    version: 1,
    save_error: null,
    source: null,
    created_at: '2026-10-16T10:00:00.000Z',
    updated_at: '2026-10-16T10:00:00.000Z',
  };
}

describe('log forms', () => {
  it('turns every form, filled with its starting values, into an entry the hub accepts', () => {
    for (const form of LOG_FORMS) {
      const entry = entryOfForm(form, initialValues(form, null), initialTime(form, null, NOW));
      const parsed = HEALTH_ENTRY_INPUT.safeParse(entry);
      expect(parsed.success, `${form.type}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it('finds a form by its record type and nothing for an unknown type', () => {
    expect(logFormOf('Weight')?.title).toBe('Weight');
    expect(logFormOf('Unknown')).toBeNull();
  });

  it('has exactly one form per record type', () => {
    const types = LOG_FORMS.map((form) => form.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('initialValues', () => {
  it('starts a new entry on each field initial and a text field empty', () => {
    const values = initialValues(formOf('Weight'), null);
    expect(values).toEqual({ kilograms: 70 });
    expect(initialValues(formOf('ExerciseSession'), null)['notes']).toBe('');
  });

  it('shows a stored value in the unit of the field', () => {
    const height = formOf('Height');
    const values = initialValues(height, rowOf(height, { meters: 1.83 }, null));
    expect(values['meters']).toBe(183);
  });

  it('falls back to the initial value when the stored one is missing', () => {
    const weight = formOf('Weight');
    expect(initialValues(weight, rowOf(weight, {}, null))['kilograms']).toBe(70);
  });
});

describe('initialTime', () => {
  it('starts an instant form now and a duration form its length earlier', () => {
    expect(initialTime(formOf('Weight'), null, NOW)).toEqual({ start: NOW, minutes: 0 });
    const exercise = formOf('ExerciseSession');
    expect(initialTime(exercise, null, NOW)).toEqual({
      start: NOW - 30 * 60_000,
      minutes: 30,
    });
  });

  it('reads the span of an existing entry in whole minutes', () => {
    const exercise = formOf('ExerciseSession');
    const row = rowOf(exercise, {}, '2026-10-16T10:45:00.000Z');
    expect(initialTime(exercise, row, NOW)).toEqual({
      start: Date.parse('2026-10-16T10:00:00.000Z'),
      minutes: 45,
    });
  });

  it('gives an open-ended entry no length', () => {
    const weight = formOf('Weight');
    expect(initialTime(weight, rowOf(weight, {}, null), NOW).minutes).toBe(0);
  });
});

describe('entryOfForm', () => {
  it('stores a scaled number in its stored unit and trims text to null when empty', () => {
    const height = formOf('Height');
    const entry = entryOfForm(height, { meters: 183 }, { start: NOW, minutes: 0 });
    expect(entry.data['meters']).toBe(1.83);
    const exercise = formOf('ExerciseSession');
    const session = entryOfForm(
      exercise,
      { ...initialValues(exercise, null), notes: '   ' },
      { start: NOW, minutes: 30 },
    );
    expect(session.data['notes']).toBeNull();
  });

  it('ends an instant entry nowhere and a duration entry after its minutes', () => {
    const weight = entryOfForm(formOf('Weight'), { kilograms: 70 }, { start: NOW, minutes: 0 });
    expect(weight.endTime).toBeNull();
    const exercise = formOf('ExerciseSession');
    const session = entryOfForm(exercise, initialValues(exercise, null), {
      start: NOW,
      minutes: 30,
    });
    expect(session.endTime).toBe(new Date(NOW + 30 * 60_000).toISOString());
    expect(session.startTime).toBe(new Date(NOW).toISOString());
  });

  it('carries the fixed fields of the form into the data', () => {
    const exercise = formOf('ExerciseSession');
    const session = entryOfForm(exercise, initialValues(exercise, null), {
      start: NOW,
      minutes: 30,
    });
    expect(session.data['segments']).toEqual([]);
  });
});
