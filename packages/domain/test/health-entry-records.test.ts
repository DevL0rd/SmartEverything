import { describe, expect, it } from 'vitest';
import {
  CLIENT_RECORD_ID,
  HEALTH_ENTRY_ROW,
  clientRecordIdOf,
  entryIdOfRecord,
  entryRecord,
  entryRecordRefs,
  entryRecords,
  entryRefOfClientRecordId,
  isOwnSource,
  type HealthEntryRow,
} from '../src/health-entries';

const ID = '3a000000-0000-4000-8000-0000000000a1';
const PROFILE = '3a000000-0000-4000-8000-0000000000b1';

function row(fields: Readonly<Record<string, unknown>>): HealthEntryRow {
  return HEALTH_ENTRY_ROW.parse({
    id: ID,
    profile_id: PROFILE,
    record_type: 'Weight',
    start_time: '2026-10-08T07:00:00Z',
    end_time: null,
    zone_offset_seconds: 3600,
    data: { kilograms: 70 },
    food: null,
    version: 1,
    created_at: '2026-10-08T07:00:00Z',
    updated_at: '2026-10-08T07:05:00Z',
    ...fields,
  });
}

const MEAL = {
  record_type: 'Nutrition',
  end_time: '2026-10-08T07:30:00Z',
  data: { name: 'Soup', mealType: 3, kilocalories: 200, kilocaloriesFromFat: null, grams: {} },
};

const PORTION = {
  foodId: null,
  name: 'Soup',
  amount: 300,
  unit: 'g',
  label: '1 bowl',
  waterMl: 250,
};

describe('own sources', () => {
  it('knows records written by this app from records of other apps', () => {
    expect(isOwnSource('smarteverything.entries')).toBe(true);
    expect(isOwnSource('smarteverything.')).toBe(true);
    expect(isOwnSource('com.google.android.apps.fitness')).toBe(false);
  });
});

describe('the health record of an entry', () => {
  it('describes the entry as an own-source record that keeps its times and update stamp', () => {
    expect(entryRecord(row({}))).toStrictEqual({
      recordId: `entry:${ID}:Weight`,
      type: 'Weight',
      startTime: '2026-10-08T07:00:00Z',
      endTime: null,
      zoneOffsetSeconds: 3600,
      sourceApp: 'smarteverything.entries',
      lastModified: '2026-10-08T07:05:00Z',
      data: { kilograms: 70 },
    });
  });

  it('adds a water record when a food entry carries water', () => {
    const records = entryRecords(row({ ...MEAL, food: PORTION }));
    expect(records.map((record) => record.type)).toStrictEqual(['Nutrition', 'Hydration']);
    expect(records[1]).toMatchObject({
      recordId: `entry:${ID}:Hydration`,
      startTime: '2026-10-08T07:00:00Z',
      endTime: '2026-10-08T07:30:00Z',
      data: { liters: 0.25 },
    });
  });

  it('keeps one record for an entry with no water', () => {
    expect(entryRecords(row({})).map((record) => record.type)).toStrictEqual(['Weight']);
    expect(
      entryRecords(row({ ...MEAL, food: { ...PORTION, waterMl: 0 } })).map((record) => record.type),
    ).toStrictEqual(['Nutrition']);
  });

  it('lists the water record reference for every food entry', () => {
    expect(entryRecordRefs({ id: ID, record_type: 'Nutrition' })).toStrictEqual([
      { type: 'Nutrition', recordId: `entry:${ID}:Nutrition` },
      { type: 'Hydration', recordId: `entry:${ID}:Hydration` },
    ]);
    expect(entryRecordRefs({ id: ID, record_type: 'Weight' })).toStrictEqual([
      { type: 'Weight', recordId: `entry:${ID}:Weight` },
    ]);
  });
});

describe('record ids', () => {
  it('turns a record id into a client record id and back', () => {
    const clientId = clientRecordIdOf(`entry:${ID}:Weight`);
    expect(clientId).toBe(`se-entry-${ID}-Weight`);
    expect(CLIENT_RECORD_ID.safeParse(clientId).success).toBe(true);
    expect(entryRefOfClientRecordId(clientId)).toStrictEqual({
      entryId: ID,
      type: 'Weight',
      recordId: `entry:${ID}:Weight`,
    });
  });

  it('refuses a client record id that is not ours or names an unknown type', () => {
    expect(() => entryRefOfClientRecordId('se-other-1')).toThrow();
    expect(() => entryRefOfClientRecordId(`se-entry-${ID}-Nonsense`)).toThrow();
  });

  it('finds the entry id inside a record id and nothing in other ids', () => {
    expect(entryIdOfRecord(`entry:${ID}:Weight`)).toBe(ID);
    expect(entryIdOfRecord('other:record')).toBeNull();
    expect(entryIdOfRecord('entry:short:Weight')).toBeNull();
  });
});
