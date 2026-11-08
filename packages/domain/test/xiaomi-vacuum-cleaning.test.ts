import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EXTRA_ROLES, VACUUM_ROLES } from '../src';
import { VACUUM_GROUPS, XIAOMI_VACUUM_CLEANING } from '../src/presentation/overrides/xiaomi-vacuum';

const ENTRY = z.object({
  siid: z.number(),
  name: z.string(),
  label: z.string(),
  destructive: z.boolean(),
  unit: z.string().nullable().optional(),
  piid: z.number().optional(),
  aiid: z.number().optional(),
  values: z.array(z.object({ spec: z.string(), appLabel: z.string() })).optional(),
});

const CATALOG = z
  .object({ properties: z.array(ENTRY), actions: z.array(ENTRY) })
  .parse(
    JSON.parse(
      readFileSync(new URL('../../xiaomi/src/vacuum/pv11gl-catalog.json', import.meta.url), 'utf8'),
    ),
  );

const OWNED_SERVICES = [3, 10];
const STANDARD_KEYS = new Set(['cleaning', 'suction', 'mop_level', 'battery']);
const SYNTHETIC_KEYS = new Set([
  'raw:clean_rooms',
  'raw:clean_zones',
  'raw:vacuum_map',
  'raw:vacuum_pose',
  'raw:vacuum_fault',
  'raw:vacuum_room_links',
]);
const ROLE_NAMES: ReadonlySet<string> = new Set([...VACUUM_ROLES, 'fault', 'charging_state']);

const propertyKey = (siid: number, piid: number): string => `raw:${String(siid)}.${String(piid)}`;
const actionKey = (siid: number, aiid: number): string =>
  `raw:action.${String(siid)}.${String(aiid)}`;

const squashed = (text: string): string => text.toLowerCase().replaceAll(' ', '');

const OVERRIDES = Object.entries(XIAOMI_VACUUM_CLEANING);

function entryOf(key: string): z.infer<typeof ENTRY> | undefined {
  return [...CATALOG.properties, ...CATALOG.actions].find((entry) =>
    entry.piid === undefined
      ? entry.aiid !== undefined && actionKey(entry.siid, entry.aiid) === key
      : propertyKey(entry.siid, entry.piid) === key,
  );
}

function override(key: string): NonNullable<(typeof XIAOMI_VACUUM_CLEANING)[string]> {
  const found = XIAOMI_VACUUM_CLEANING[key];
  if (found === undefined) {
    throw new Error(`missing override ${key}`);
  }
  return found;
}

describe('vacuum cleaning override scope', () => {
  it('covers every battery and map entry of the catalog', () => {
    const missing = [...CATALOG.properties, ...CATALOG.actions]
      .filter((entry) => OWNED_SERVICES.includes(entry.siid))
      .map((entry) =>
        entry.piid === undefined
          ? actionKey(entry.siid, entry.aiid ?? 0)
          : propertyKey(entry.siid, entry.piid),
      )
      .filter((key) => key !== 'raw:3.1' && XIAOMI_VACUUM_CLEANING[key] === undefined);
    expect(XIAOMI_VACUUM_CLEANING['battery']).toBeDefined();
    expect(missing).toEqual([]);
  });

  it('covers every cleaning and job entry of service 2 that is not a station or setting entry', () => {
    for (const key of [
      'raw:2.2',
      'raw:2.3',
      'raw:2.66',
      'raw:2.16',
      'raw:2.12',
      'raw:2.40',
      'raw:action.2.1',
      'raw:action.2.16',
      'raw:action.2.37',
      'raw:action.2.51',
      'raw:action.2.59',
    ]) {
      expect(XIAOMI_VACUUM_CLEANING[key], key).toBeDefined();
    }
  });

  it('only keys catalog entries, bound standard keys and synthetic capabilities', () => {
    const unknown = OVERRIDES.map(([key]) => key).filter(
      (key) => entryOf(key) === undefined && !STANDARD_KEYS.has(key) && !SYNTHETIC_KEYS.has(key),
    );
    expect(unknown).toEqual([]);
  });

  it('never claims a station or setting entry that belongs to the dock override', () => {
    for (const key of ['raw:2.18', 'raw:2.20', 'raw:2.45', 'raw:2.83', 'raw:action.2.19']) {
      expect(XIAOMI_VACUUM_CLEANING[key], key).toBeUndefined();
    }
  });
});

describe('vacuum cleaning override roles', () => {
  it('uses only known roles and never repeats one', () => {
    const roles = OVERRIDES.flatMap(([, entry]) => (entry.role === undefined ? [] : [entry.role]));
    expect(roles.filter((role) => !ROLE_NAMES.has(role))).toEqual([]);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('keeps every vacuum role registered with the presentation extras', () => {
    for (const [, entry] of OVERRIDES) {
      if (entry.role !== undefined) {
        expect(EXTRA_ROLES.some((role) => role === entry.role)).toBe(true);
      }
    }
  });

  it('puts every entry in a known group', () => {
    const labels: readonly string[] = Object.values(VACUUM_GROUPS);
    for (const [key, entry] of OVERRIDES) {
      expect(labels, key).toContain(entry.groupLabel);
    }
  });
});

describe('vacuum cleaning override danger', () => {
  it('states a danger tier for every action', () => {
    for (const [key, entry] of OVERRIDES.filter(
      ([key]) => key.includes('action.') || key.startsWith('raw:clean_'),
    )) {
      expect(entry.danger, key).toBeDefined();
    }
  });

  it('never leaves a destructive catalog action without a danger tier', () => {
    const destructive = CATALOG.actions.filter(
      (entry) =>
        entry.destructive &&
        XIAOMI_VACUUM_CLEANING[actionKey(entry.siid, entry.aiid ?? 0)] !== undefined,
    );
    expect(destructive.length).toBeGreaterThan(8);
    for (const entry of destructive) {
      const key = actionKey(entry.siid, entry.aiid ?? 0);
      expect(override(key).danger?.tier, key).not.toBe('none');
    }
  });

  it('types DELETE for clearing, deleting and restoring maps and schedules', () => {
    for (const key of [
      'raw:action.10.1',
      'raw:action.10.2',
      'raw:action.10.8',
      'raw:action.2.25',
      'raw:action.2.39',
    ]) {
      expect(override(key).danger).toEqual({ tier: 'typed', word: 'DELETE' });
    }
  });

  it('asks for confirmation on set map, save map, rename, rotate and room splits', () => {
    for (const key of [
      'raw:action.10.3',
      'raw:action.10.4',
      'raw:action.10.6',
      'raw:action.2.65',
      'raw:action.2.14',
      'raw:action.2.15',
    ]) {
      expect(override(key).danger).toEqual({ tier: 'confirm' });
    }
  });

  it('keeps the everyday run commands free of confirmation', () => {
    for (const key of [
      'raw:action.2.1',
      'raw:action.2.3',
      'raw:action.2.7',
      'raw:action.2.8',
      'raw:action.3.1',
      'raw:clean_rooms',
      'raw:clean_zones',
    ]) {
      expect(override(key).danger).toEqual({ tier: 'none' });
    }
  });
});

describe('vacuum cleaning override labels and options', () => {
  it('maps the status values to the official app labels', () => {
    const status = CATALOG.properties.find((entry) => entry.siid === 2 && entry.piid === 2);
    const options = override('raw:2.2').options ?? {};
    for (const value of status?.values ?? []) {
      expect(options[value.spec], value.spec).toBeDefined();
      expect(squashed(options[value.spec] ?? '')).toBe(squashed(value.appLabel));
    }
    expect(Object.keys(options)).toHaveLength(status?.values?.length ?? -1);
  });

  it('keeps the spec value names as option keys for the other enums', () => {
    const pairs: readonly (readonly [string, string])[] = [
      ['raw:2.4', '2.4'],
      ['raw:2.5', '2.5'],
      ['raw:2.8', '2.8'],
      ['suction', '2.9'],
      ['mop_level', '2.10'],
      ['raw:2.96', '2.96'],
      ['raw:3.2', '3.2'],
      ['raw:10.10', '10.10'],
    ];
    for (const [key, address] of pairs) {
      const [siid, piid] = address.split('.').map(Number);
      const property = CATALOG.properties.find(
        (entry) => entry.siid === siid && entry.piid === piid,
      );
      expect(Object.keys(override(key).options ?? {}).sort(), key).toEqual(
        (property?.values ?? []).map((value) => value.spec).sort(),
      );
    }
  });

  it('shows the suction labels of the official app', () => {
    expect(override('suction').options).toEqual({
      Silent: 'Silent',
      Basic: 'Standard',
      Strong: 'Strong',
      'Full Speed': 'Turbo',
    });
  });

  it('offers every cleaning reading and command a label', () => {
    const options = override('cleaning').options ?? {};
    expect(Object.keys(options)).toEqual(
      expect.arrayContaining([
        'idle',
        'docked',
        'cleaning',
        'start',
        'pause',
        'resume',
        'dock',
        'stop',
      ]),
    );
  });

  it('keeps the official wording inside the label of every catalog entry it names', () => {
    const renamed = new Set([
      'raw:action.2.2',
      'raw:2.1',
      'raw:2.6',
      'raw:2.17',
      'raw:2.85',
      'raw:2.86',
      'raw:2.87',
      'raw:2.19',
      'raw:2.99',
      'raw:2.58',
      'raw:2.56',
    ]);
    const mismatched = OVERRIDES.filter(([key, entry]) => {
      const official = entryOf(key);
      if (
        official === undefined ||
        renamed.has(key) ||
        entry.tier === 'diagnostic' ||
        entry.tier === 'hidden'
      ) {
        return false;
      }
      const words = official.label
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length >= 3);
      return !words.some((word) => entry.label.toLowerCase().includes(word.replace(/s$/, '')));
    }).map(([key, entry]) => `${key} ${entry.label}`);
    expect(mismatched).toEqual([]);
  });
});

describe('vacuum cleaning override units', () => {
  it('shows seconds and minutes as clocks and progress as percent', () => {
    expect(override('raw:2.7').clock).toBe('seconds');
    expect(override('raw:2.87').clock).toBe('minutes');
    expect(override('raw:2.89').unit).toBe('%');
  });

  it('shows the unconfirmed area scales raw with a note and no conversion', () => {
    for (const key of ['raw:2.6', 'raw:2.85']) {
      const entry = override(key);
      expect(entry.tier).toBe('diagnostic');
      expect(entry.label).toContain('unit unconfirmed');
      expect(entry.unit).toBeUndefined();
      expect(entry.format).toBeUndefined();
    }
  });

  it('keeps the voltage raw because the spec declares no unit', () => {
    const voltage = CATALOG.properties.find((entry) => entry.siid === 3 && entry.piid === 3);
    expect(voltage?.unit ?? null).toBeNull();
    expect(override('raw:3.3').unit).toBeUndefined();
    expect(override('raw:3.3').label).toContain('raw');
  });
});

describe('vacuum cleaning override tiers', () => {
  it('puts the run commands first and the map blobs out of sight', () => {
    expect(override('raw:action.2.1').tier).toBe('primary');
    expect(override('raw:action.2.7').tier).toBe('primary');
    expect(override('cleaning').tier).toBe('primary');
    for (const key of [
      'raw:10.1',
      'raw:10.3',
      'raw:10.13',
      'raw:vacuum_map',
      'raw:vacuum_pose',
      'raw:2.16',
    ]) {
      expect(override(key).tier, key).toBe('hidden');
    }
  });

  it('marks the write-ignored sweep type as read only', () => {
    expect(override('raw:2.5').readOnly).toBe(true);
  });

  it('gives the main readings the searchable robot words', () => {
    for (const key of ['raw:2.2', 'suction', 'raw:action.2.1', 'raw:action.2.3']) {
      expect(override(key).keywords, key).toEqual(expect.arrayContaining(['robot', 'vacuum']));
    }
    expect(override('raw:action.2.1').keywords).toContain('hoover');
    expect(override('suction').keywords).toContain('turbo');
  });
});
