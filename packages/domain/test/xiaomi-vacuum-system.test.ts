import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as domain from '../src';
import { EXTRA_ROLES, MODEL_OVERRIDES, VACUUM_ROLES, deviceFamily } from '../src';
import { XIAOMI_VACUUM_CLEANING, VACUUM_GROUPS } from '../src/presentation/overrides/xiaomi-vacuum';
import { XIAOMI_VACUUM_DOCK } from '../src/presentation/overrides/xiaomi-vacuum-dock';
import {
  XIAOMI_VACUUM_EVENTS,
  XIAOMI_VACUUM_SYSTEM,
  dndPeriodText,
} from '../src/presentation/overrides/xiaomi-vacuum-system';

const ENTRY = z.object({
  siid: z.number(),
  name: z.string(),
  label: z.string(),
  destructive: z.boolean(),
  inSpec: z.boolean().optional(),
  piid: z.number().optional(),
  aiid: z.number().optional(),
  eiid: z.number().optional(),
  values: z.array(z.object({ spec: z.string(), appLabel: z.string() })).optional(),
});

const CATALOG = z
  .object({ properties: z.array(ENTRY), actions: z.array(ENTRY), events: z.array(ENTRY) })
  .parse(
    JSON.parse(
      readFileSync(new URL('../../xiaomi/src/vacuum/pv11gl-catalog.json', import.meta.url), 'utf8'),
    ),
  );

const MODEL = 'xiaomi.vacuum.pv11gl';
const OWNED_SERVICES = [1, 4, 5, 6, 11, 12, 13, 14, 15, 17, 20, 21, 22, 23];
const STANDARD_BOUND: Readonly<Record<string, string>> = {
  'raw:1.4': 'firmware',
  'raw:2.9': 'suction',
  'raw:2.10': 'mop_level',
  'raw:3.1': 'battery',
  'raw:4.1': 'buzzer',
  'raw:4.2': 'volume',
  'raw:5.1': 'child_lock',
  'raw:11.1': 'dnd',
  'raw:14.1': 'filter_life',
  'raw:action.14.1': 'filter_reset',
};
const SYNTHETIC_KEYS = [
  'cleaning',
  'raw:clean_rooms',
  'raw:clean_zones',
  'raw:vacuum_map',
  'raw:vacuum_pose',
  'raw:vacuum_fault',
  'raw:vacuum_room_links',
];
const ROLE_NAMES: ReadonlySet<string> = new Set([...VACUUM_ROLES, 'fault', 'charging_state']);

const FILES = [XIAOMI_VACUUM_CLEANING, XIAOMI_VACUUM_DOCK, XIAOMI_VACUUM_SYSTEM];
const SYSTEM = Object.entries(XIAOMI_VACUUM_SYSTEM);
const MERGED = MODEL_OVERRIDES[MODEL]?.capabilities ?? {};

const propertyKey = (entry: z.infer<typeof ENTRY>): string =>
  `raw:${String(entry.siid)}.${String(entry.piid)}`;
const actionKey = (entry: z.infer<typeof ENTRY>): string =>
  `raw:action.${String(entry.siid)}.${String(entry.aiid)}`;
const eventKey = (entry: z.infer<typeof ENTRY>): string =>
  `raw:event.${String(entry.siid)}.${String(entry.eiid)}`;

const overrideKey = (raw: string): string => STANDARD_BOUND[raw] ?? raw;
const PROPERTY_KEYS = CATALOG.properties.map((entry) => overrideKey(propertyKey(entry)));
const ACTION_KEYS = CATALOG.actions.map((entry) => overrideKey(actionKey(entry)));

function override(key: string): NonNullable<(typeof XIAOMI_VACUUM_SYSTEM)[string]> {
  const found = MERGED[key];
  if (found === undefined) {
    throw new Error(`missing override ${key}`);
  }
  return found;
}

describe('vacuum override completeness', () => {
  it('has the catalog sizes the plan counts', () => {
    expect(CATALOG.properties.filter((entry) => entry.inSpec === true)).toHaveLength(169);
    expect(CATALOG.properties).toHaveLength(191);
    expect(CATALOG.actions).toHaveLength(101);
    expect(CATALOG.events).toHaveLength(5);
  });

  it('gives every catalog property and action exactly one override across the three files', () => {
    const keys = [...PROPERTY_KEYS, ...ACTION_KEYS];
    expect(keys.filter((key) => MERGED[key] === undefined)).toEqual([]);
    const owners = keys.map((key) => FILES.filter((file) => file[key] !== undefined).length);
    expect(owners.filter((count) => count !== 1)).toEqual([]);
  });

  it('keys nothing but catalog entries, bound standard keys and synthetic capabilities', () => {
    const known = new Set([
      ...PROPERTY_KEYS,
      ...ACTION_KEYS,
      ...Object.values(STANDARD_BOUND),
      ...SYNTHETIC_KEYS,
    ]);
    expect(Object.keys(MERGED).filter((key) => !known.has(key))).toEqual([]);
  });

  it('never repeats a key across the three override files', () => {
    const keys = FILES.flatMap((file) => Object.keys(file));
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(MERGED)).toHaveLength(keys.length);
  });

  it('covers every entry of the services this file owns', () => {
    const owned = [
      ...CATALOG.properties.filter((entry) => OWNED_SERVICES.includes(entry.siid)).map(propertyKey),
      ...CATALOG.actions.filter((entry) => OWNED_SERVICES.includes(entry.siid)).map(actionKey),
    ];
    expect(owned.map(overrideKey).filter((key) => XIAOMI_VACUUM_SYSTEM[key] === undefined)).toEqual(
      [],
    );
  });

  it('presents every catalog event', () => {
    const keys = CATALOG.events.map(eventKey);
    expect(Object.keys(XIAOMI_VACUUM_EVENTS).sort()).toEqual([...keys].sort());
    for (const entry of CATALOG.events) {
      const presentation = XIAOMI_VACUUM_EVENTS[eventKey(entry)];
      expect(presentation?.label, entry.name).toBeTruthy();
      expect(presentation?.keywords.length, entry.name).toBeGreaterThan(0);
    }
  });

  it('registers the model in the vacuum family', () => {
    expect(MODEL_OVERRIDES[MODEL]?.family).toBe('vacuum');
    expect(deviceFamily({ kind: 'vacuum', model: MODEL })).toBe('vacuum');
    expect(MODEL_OVERRIDES[MODEL]?.unlisted).toMatchObject({ tier: 'diagnostic', group: 'system' });
  });
});

describe('vacuum override roles', () => {
  it('uses only registered vacuum roles and never repeats one across the three files', () => {
    const roles = FILES.flatMap((file) =>
      Object.values(file).flatMap((entry) => (entry.role === undefined ? [] : [entry.role])),
    );
    expect(roles.filter((role) => !ROLE_NAMES.has(role))).toEqual([]);
    expect(new Set(roles).size).toBe(roles.length);
    for (const role of roles) {
      expect(EXTRA_ROLES.some((extra) => extra === role)).toBe(true);
    }
  });

  it('puts every entry in a known group', () => {
    const labels: readonly string[] = Object.values(VACUUM_GROUPS);
    for (const [key, entry] of Object.entries(MERGED)) {
      expect(labels, key).toContain(entry.groupLabel);
    }
  });

  it('keeps the spec value names as option keys for every enum it labels', () => {
    for (const [key, entry] of SYSTEM) {
      const catalogEntry = [...CATALOG.properties, ...CATALOG.actions].find(
        (candidate) => overrideKey(propertyKey(candidate)) === key,
      );
      if (entry.options !== undefined && catalogEntry !== undefined) {
        const names = (catalogEntry.values ?? []).map((value) => value.spec).sort();
        expect(Object.keys(entry.options).sort(), key).toEqual(names);
      }
    }
  });
});

describe('vacuum override danger', () => {
  it('states a danger tier for every action of the model', () => {
    for (const key of ACTION_KEYS) {
      expect(override(key).danger, key).toBeDefined();
    }
  });

  it('never leaves a destructive catalog action without a danger tier', () => {
    const destructive = CATALOG.actions.filter((entry) => entry.destructive);
    expect(destructive.length).toBeGreaterThan(20);
    for (const entry of destructive) {
      const key = overrideKey(actionKey(entry));
      expect(override(key).danger?.tier, key).not.toBe('none');
    }
  });

  it('types RESET for every consumable reset of the brushes and the filter', () => {
    for (const key of ['raw:action.12.1', 'raw:action.13.1', 'filter_reset']) {
      expect(override(key).danger, key).toEqual({ tier: 'typed', word: 'RESET' });
    }
  });

  it('types RESET and hides the factory check modes and the lidar control', () => {
    for (let aiid = 11; aiid <= 15; aiid += 1) {
      const key = `raw:action.20.${String(aiid)}`;
      expect(override(key).danger, key).toEqual({ tier: 'typed', word: 'RESET' });
      expect(override(key).tier, key).toBe('hidden');
    }
    expect(override('raw:action.20.7').danger).toEqual({ tier: 'typed', word: 'RESET' });
    expect(override('raw:action.20.7').tier).toBe('hidden');
  });

  it('asks for confirmation on the video password, the camera switch and voice download', () => {
    for (const key of [
      'raw:action.21.6',
      'raw:action.21.7',
      'raw:action.21.8',
      'raw:21.6',
      'raw:action.15.1',
      'raw:action.20.3',
    ]) {
      expect(override(key).danger, key).toEqual({ tier: 'confirm' });
    }
  });

  it('keeps find robot free of confirmation', () => {
    expect(override('raw:action.6.1').danger).toEqual({ tier: 'none' });
    expect(override('raw:action.6.1').role).toBe('vacuum_identify');
  });

  it('types DELETE for every map clear, delete and restore across the files', () => {
    for (const key of ['raw:action.10.1', 'raw:action.10.2', 'raw:action.10.8']) {
      expect(override(key).danger, key).toEqual({ tier: 'typed', word: 'DELETE' });
    }
    for (const key of ['raw:action.10.3', 'raw:action.10.4']) {
      expect(override(key).danger, key).toEqual({ tier: 'confirm' });
    }
  });
});

describe('vacuum override consumables and readings', () => {
  it('shows the brush and filter life as percent and time left as hours', () => {
    for (const key of ['raw:12.1', 'raw:13.1', 'filter_life']) {
      expect(override(key).unit, key).toBe('%');
      expect(override(key).tier, key).toBe('maintenance');
      expect(override(key).groupLabel, key).toBe('Care');
    }
    for (const key of ['raw:12.2', 'raw:13.2', 'raw:14.2']) {
      expect(override(key).unit, key).toBe('h');
      expect(override(key).tier, key).toBe('maintenance');
    }
    expect(override('raw:12.1').role).toBe('vacuum_main_brush_life');
    expect(override('raw:13.2').role).toBe('vacuum_side_brush_left');
    expect(override('raw:14.2').role).toBe('vacuum_filter_left');
  });

  it('decodes the do not disturb window and keeps the role mapping', () => {
    expect(dndPeriodText(369100800)).toBe('22:00 to 08:00');
    expect(dndPeriodText(0x0b1e1700)).toBe('11:30 to 23:00');
    expect(dndPeriodText('x')).toBe('"x"');
    expect(override('raw:11.2').format?.(369100800)).toBe('22:00 to 08:00');
    expect(override('raw:11.2').role).toBe('vacuum_dnd_period');
    expect(override('raw:11.3').role).toBe('vacuum_dnd_now');
    expect(override('dnd').groupLabel).toBe('Do not disturb');
  });

  it('labels the lidar position, the voice download state and the camera options', () => {
    expect(override('raw:20.11').options?.['Top']).toBe('Raised');
    expect(override('raw:15.3').options?.['Download Fail']).toBe('Download failed');
    expect(override('raw:21.2').options?.['Open']).toBe('On');
    expect(override('raw:21.2').groupLabel).toBe('Camera and AI');
  });

  it('exposes the event presentation and the quiet hours text from the package index', () => {
    expect(domain.XIAOMI_VACUUM_EVENTS).toBe(XIAOMI_VACUUM_EVENTS);
    expect(domain.dndPeriodText).toBe(dndPeriodText);
  });

  it('keeps the unconfirmed units visible in the label', () => {
    expect(override('raw:20.8').label).toContain('unit unconfirmed');
    expect(override('raw:2.6').label).toContain('unit unconfirmed');
  });
});
