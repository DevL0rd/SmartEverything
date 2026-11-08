import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as domain from '../src';
import { EXTRA_ROLES, VACUUM_ROLES } from '../src';
import { XIAOMI_VACUUM_CLEANING, VACUUM_GROUPS } from '../src/presentation/overrides/xiaomi-vacuum';
import {
  VACUUM_COUPLINGS,
  XIAOMI_VACUUM_DOCK,
} from '../src/presentation/overrides/xiaomi-vacuum-dock';

const ENTRY = z.object({
  siid: z.number(),
  name: z.string(),
  label: z.string(),
  destructive: z.boolean(),
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

const OWNED_SERVICES = [2, 9, 18, 19, 24];
const STANDARD_BOUND = new Set(['raw:2.9', 'raw:2.10']);
const ROLE_NAMES: ReadonlySet<string> = new Set([...VACUUM_ROLES, 'fault', 'charging_state']);

const propertyKey = (siid: number, piid: number): string => `raw:${String(siid)}.${String(piid)}`;
const actionKey = (siid: number, aiid: number): string =>
  `raw:action.${String(siid)}.${String(aiid)}`;

const ALL = [...CATALOG.properties, ...CATALOG.actions];
const OVERRIDES = Object.entries(XIAOMI_VACUUM_DOCK);
const keyOf = (entry: z.infer<typeof ENTRY>): string =>
  entry.piid === undefined
    ? actionKey(entry.siid, entry.aiid ?? 0)
    : propertyKey(entry.siid, entry.piid);

function override(key: string): NonNullable<(typeof XIAOMI_VACUUM_DOCK)[string]> {
  const found = XIAOMI_VACUUM_DOCK[key];
  if (found === undefined) {
    throw new Error(`missing override ${key}`);
  }
  return found;
}

function specNames(key: string): readonly string[] {
  const found = ALL.find((entry) => keyOf(entry) === key);
  return (found?.values ?? []).map((value) => value.spec).sort();
}

describe('vacuum dock override scope', () => {
  it('covers every service 2 entry the cleaning override leaves out, plus services 9, 18, 19 and 24', () => {
    const missing = ALL.filter((entry) => OWNED_SERVICES.includes(entry.siid))
      .map(keyOf)
      .filter(
        (key) =>
          !STANDARD_BOUND.has(key) &&
          XIAOMI_VACUUM_CLEANING[key] === undefined &&
          XIAOMI_VACUUM_DOCK[key] === undefined,
      );
    expect(missing).toEqual([]);
  });

  it('never repeats an entry of the cleaning override and only keys catalog entries', () => {
    const keys = OVERRIDES.map(([key]) => key);
    expect(keys.filter((key) => XIAOMI_VACUUM_CLEANING[key] !== undefined)).toEqual([]);
    const known = new Set(ALL.map(keyOf));
    expect(keys.filter((key) => !known.has(key))).toEqual([]);
    expect(keys.filter((key) => STANDARD_BOUND.has(key))).toEqual([]);
  });

  it('uses only known registered roles and never repeats one across both override files', () => {
    const dockRoles = OVERRIDES.flatMap(([, entry]) =>
      entry.role === undefined ? [] : [entry.role],
    );
    const cleaningRoles = Object.values(XIAOMI_VACUUM_CLEANING).flatMap((entry) =>
      entry.role === undefined ? [] : [entry.role],
    );
    const roles = [...dockRoles, ...cleaningRoles];
    expect(dockRoles.filter((role) => !ROLE_NAMES.has(role))).toEqual([]);
    expect(new Set(roles).size).toBe(roles.length);
    for (const role of dockRoles) {
      expect(EXTRA_ROLES.some((extra) => extra === role)).toBe(true);
    }
  });

  it('puts every entry in a known group', () => {
    const labels: readonly string[] = Object.values(VACUUM_GROUPS);
    for (const [key, entry] of OVERRIDES) {
      expect(labels, key).toContain(entry.groupLabel);
    }
  });
});

describe('vacuum dock override station', () => {
  it('maps the station status, dock actions and roller washing to their roles', () => {
    expect(override('raw:2.18').role).toBe('vacuum_station_mode');
    expect(override('raw:2.18').tier).toBe('hidden');
    expect(override('raw:action.2.18').role).toBe('vacuum_empty_dust');
    expect(override('raw:action.2.20').role).toBe('vacuum_dry_mop');
    expect(override('raw:action.2.32').role).toBe('vacuum_stop_dry');
    expect(override('raw:action.24.2').role).toBe('vacuum_start_roller_wash');
    expect(override('raw:action.24.3').role).toBe('vacuum_stop_roller_wash');
  });

  it('offers roller washing as the clean mop control and hides the unused mop wash actions', () => {
    for (const key of [
      'raw:action.24.2',
      'raw:action.24.3',
      'raw:action.2.18',
      'raw:action.2.20',
    ]) {
      expect(override(key).tier, key).toBe('control');
      expect(override(key).danger, key).toEqual({ tier: 'none' });
    }
    for (const key of [
      'raw:action.2.19',
      'raw:action.2.31',
      'raw:action.2.45',
      'raw:action.2.49',
    ]) {
      expect(override(key).tier, key).toBe('hidden');
    }
  });

  it('asks for confirmation before emptying a water tank', () => {
    for (const key of ['raw:action.2.57', 'raw:action.2.58']) {
      expect(override(key).danger, key).toEqual({ tier: 'confirm' });
    }
  });

  it('shows the drying and tank readings with units and options', () => {
    expect(override('raw:2.88').unit).toBe('%');
    expect(override('raw:2.90').clock).toBe('minutes');
    expect(override('raw:2.101').options?.['Not Installed']).toBe('Not installed');
    expect(override('raw:2.100').options?.['Empting Completed']).toBe('Emptying done');
  });

  it('keeps the spec value names as option keys for every enum it labels', () => {
    for (const [key, entry] of OVERRIDES) {
      if (entry.options !== undefined && !key.startsWith('raw:action')) {
        expect(Object.keys(entry.options).sort(), key).toEqual(specNames(key));
      }
    }
  });
});

describe('vacuum dock override guarded settings', () => {
  it('puts worry-free mode behind a confirm tier with its coupling note', () => {
    expect(override('raw:2.83').danger).toEqual({ tier: 'confirm' });
    expect(override('raw:2.83').role).toBe('vacuum_worry_free');
    const coupling = VACUUM_COUPLINGS['raw:2.83'];
    expect(coupling?.rewrites).toEqual(
      expect.arrayContaining(['suction', 'raw:2.8', 'raw:2.30', 'raw:2.32']),
    );
    expect(coupling?.note).toContain('rewrites');
  });

  it('states that turning off AI detection also turns off real scene capture', () => {
    expect(VACUUM_COUPLINGS['raw:2.45']?.rewrites).toEqual(['raw:2.93']);
    expect(VACUUM_COUPLINGS['raw:2.45']?.note).toContain('real-scene capture');
    expect(override('raw:2.45').role).toBe('vacuum_ai_detection');
    expect(override('raw:2.93').role).toBe('vacuum_scene_capture');
  });

  it('exports the couplings from the package index', () => {
    expect(domain.VACUUM_COUPLINGS).toBe(VACUUM_COUPLINGS);
  });

  it('couples only entries that exist in the overrides', () => {
    for (const [source, coupling] of Object.entries(VACUUM_COUPLINGS)) {
      expect(XIAOMI_VACUUM_DOCK[source], source).toBeDefined();
      for (const target of coupling.rewrites) {
        const present = XIAOMI_VACUUM_DOCK[target] ?? XIAOMI_VACUUM_CLEANING[target];
        expect(present, target).toBeDefined();
      }
    }
  });
});

describe('vacuum dock override consumables', () => {
  it('types RESET for every consumable reset of its services', () => {
    for (const key of ['raw:action.9.1', 'raw:action.18.1', 'raw:action.19.1', 'raw:action.24.1']) {
      expect(override(key).danger, key).toEqual({ tier: 'typed', word: 'RESET' });
    }
  });

  it('never leaves a destructive catalog action without a danger tier', () => {
    const destructive = CATALOG.actions.filter(
      (entry) => entry.destructive && XIAOMI_VACUUM_DOCK[keyOf(entry)] !== undefined,
    );
    expect(destructive).toHaveLength(4);
    for (const entry of destructive) {
      expect(override(keyOf(entry)).danger?.tier, keyOf(entry)).not.toBe('none');
    }
  });

  it('shows life levels as percent and time left as hours', () => {
    for (const key of ['raw:9.1', 'raw:24.1', 'raw:18.1', 'raw:19.1']) {
      expect(override(key).unit, key).toBe('%');
    }
    for (const key of ['raw:9.2', 'raw:24.2', 'raw:18.4']) {
      expect(override(key).unit, key).toBe('h');
    }
  });

  it('shows the unconfirmed dust bag time raw with a note and no conversion', () => {
    const entry = override('raw:19.2');
    expect(entry.tier).toBe('diagnostic');
    expect(entry.label).toContain('unit unconfirmed');
    expect(entry.unit).toBeUndefined();
    expect(entry.format).toBeUndefined();
  });

  it('keeps the detergent self delivery switch on service 18 and the duplicate in service 2 plain', () => {
    expect(override('raw:18.2').role).toBe('vacuum_detergent_delivery');
    expect(override('raw:2.59').role).toBeUndefined();
    expect(override('raw:2.59').tier).toBe('diagnostic');
  });

  it('names the corner mop and the roller mop apart', () => {
    expect(override('raw:9.1').label).toContain('Corner');
    expect(override('raw:24.1').label).toContain('Roller');
  });
});

describe('vacuum dock override search words', () => {
  it('gives the station controls the dock and mop words', () => {
    expect(override('raw:action.24.2').keywords).toEqual(
      expect.arrayContaining(['roller', 'mop', 'dock', 'station']),
    );
    expect(override('raw:action.2.18').keywords).toContain('dust');
    expect(override('raw:2.83').keywords).toContain('robot');
  });
});
