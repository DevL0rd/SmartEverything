import { describe, expect, it } from 'vitest';
import {
  MIOT_SPEC,
  STATION_MODES,
  VACUUM_CATALOG,
  VACUUM_SERVICE_ID,
  VacuumCatalogError,
  actionSafety,
  findAction,
  findEvent,
  findProperty,
  isAbsentOnDevice,
  parseUrn,
  pv11glCatalog,
  vacuumAction,
  vacuumConsumables,
  vacuumEvent,
  vacuumFault,
  vacuumFaultTable,
  vacuumProperty,
  vacuumSafety,
  vacuumStationFunctions,
  vacuumStationMode,
  vacuumStatus,
  vacuumStatusTable,
  type MiotProperty,
  type MiotSpec,
  type VacuumProperty,
} from '../src';
import { fixtureJson } from './vacuum-support';

const catalog = pv11glCatalog();
const spec: MiotSpec = MIOT_SPEC.parse(fixtureJson('pv11gl-spec.json'));
const inSpec = (property: VacuumProperty): boolean => property.inSpec;
const idOf = (entry: { piid?: number; aiid?: number; eiid?: number }): number =>
  entry.piid ?? entry.aiid ?? entry.eiid ?? 0;

interface Shape {
  readonly address: string;
  readonly name: string;
  readonly [field: string]: unknown;
}

function propertyShape(siid: number, property: MiotProperty): Shape {
  return {
    address: `P${String(siid)}.${String(property.iid)}`,
    name: parseUrn(property.type).name,
    format: property.format,
    access: [...property.access].sort(),
    unit: property.unit ?? null,
    range: property['value-range'] ?? null,
    values: (property['value-list'] ?? []).map((option) => option.value),
  };
}

function catalogPropertyShape(property: VacuumProperty): Shape {
  return {
    address: `P${String(property.siid)}.${String(property.piid)}`,
    name: property.name,
    format: property.format,
    access: [...property.access].sort(),
    unit: property.unit,
    range: property.range,
    values: property.values.map((option) => option.value),
  };
}

describe('the pv11gl catalog', () => {
  it('holds every service, property, action and event of the spec and the hidden properties found on the robot', () => {
    expect(catalog.model).toBe('xiaomi.vacuum.pv11gl');
    expect(catalog.services.filter((service) => service.inSpec)).toHaveLength(21);
    expect(catalog.properties.filter(inSpec)).toHaveLength(169);
    expect(catalog.properties.filter((property) => !property.inSpec)).toHaveLength(22);
    expect(catalog.actions).toHaveLength(101);
    expect(catalog.events).toHaveLength(5);
  });

  it('gives every entry a unique address inside a known service', () => {
    const entries = [...catalog.properties, ...catalog.actions, ...catalog.events];
    const addresses = entries.map(
      (entry) => `${entry.kind}.${String(entry.siid)}.${String(idOf(entry))}`,
    );
    expect(new Set(addresses).size).toBe(entries.length);
    const sids = new Set(catalog.services.map((service) => service.siid));
    expect(sids.size).toBe(catalog.services.length);
    expect(entries.every((entry) => sids.has(entry.siid))).toBe(true);
  });

  it('matches the spec fixture entry by entry: name, format, access, unit, range, value list, inputs, outputs', () => {
    const fromSpec = spec.services.flatMap((service) => [
      ...service.properties.map((property) => propertyShape(service.iid, property)),
      ...service.actions.map((action) => ({
        address: `A${String(service.iid)}.${String(action.iid)}`,
        name: parseUrn(action.type).name,
        inputs: action.in,
        outputs: action.out,
      })),
      ...service.events.map((event) => ({
        address: `E${String(service.iid)}.${String(event.iid)}`,
        name: parseUrn(event.type).name,
      })),
    ]);
    const fromCatalog = [
      ...catalog.properties.filter(inSpec).map(catalogPropertyShape),
      ...catalog.actions.map((action) => ({
        address: `A${String(action.siid)}.${String(action.aiid)}`,
        name: action.name,
        inputs: action.inputs,
        outputs: action.outputs,
      })),
      ...catalog.events.map((event) => ({
        address: `E${String(event.siid)}.${String(event.eiid)}`,
        name: event.name,
      })),
    ];
    const byAddress = (a: { address: string }, b: { address: string }): number =>
      a.address.localeCompare(b.address);
    expect(fromCatalog.sort(byAddress)).toEqual(fromSpec.sort(byAddress));
  });

  it('keeps hidden properties out of the spec, read only and never written', () => {
    const hidden = catalog.properties.filter((property) => !property.inSpec);
    const known = new Set(
      spec.services.flatMap((s) => s.properties.map((p) => `${String(s.iid)}.${String(p.iid)}`)),
    );
    expect(
      hidden.every((property) => !known.has(`${String(property.siid)}.${String(property.piid)}`)),
    ).toBe(true);
    expect(hidden.every((property) => property.live.readOk && property.live.write === null)).toBe(
      true,
    );
    expect(hidden.every((property) => property.access.join() === 'read')).toBe(true);
  });

  it('records live results only on entries that can have them', () => {
    const written = catalog.properties.filter((property) => property.live.write !== null);
    expect(written.length).toBeGreaterThan(50);
    expect(written.every((property) => property.inSpec && property.access.includes('write'))).toBe(
      true,
    );
    expect(catalog.properties.filter(inSpec).every((property) => property.live.readOk)).toBe(true);
    const called = catalog.actions.filter((action) => action.live !== null);
    expect(called.map((action) => `${String(action.siid)}.${String(action.aiid)}`)).toEqual(
      expect.arrayContaining(['2.1', '2.3', '2.7', '2.8', '2.28', '2.29', '6.1', '10.7']),
    );
    expect(findEvent(2, 2)?.live.pushed).toBe(true);
    expect(findEvent(2, 1)?.live.pushed).toBe(false);
  });

  it('keeps the proven oddities of the robot as danger notes', () => {
    const notes: readonly (readonly [number, number, RegExp])[] = [
      [2, 45, /2\.93/],
      [2, 83, /rewrites many other settings/],
      [2, 5, /ignored/],
      [2, 10, /ignored/],
      [2, 68, /spec lists only 1 and 2/],
      [21, 6, /never be bound to the power capability/],
    ];
    const missing = notes.filter(
      ([siid, piid, pattern]) => !pattern.test(findProperty(siid, piid)?.danger ?? ''),
    );
    expect(missing).toEqual([]);
    expect(findProperty(2, 5)?.live.write?.readBackMatches).toBe(false);
    expect(findProperty(2, 10)?.live.write?.readBackMatches).toBe(false);
    for (const aiid of [1, 4, 6]) {
      expect(findAction(2, aiid)?.danger).toMatch(/100051/);
    }
  });

  it('marks every reset, delete, factory and credential action destructive', () => {
    const destructive = catalog.actions.filter((action) => action.destructive);
    const resets = catalog.actions.filter((action) =>
      /^reset-|clear-map|delete-map|check-mode|set-video-password|forgot-password/.test(
        action.name,
      ),
    );
    expect(resets.length).toBeGreaterThanOrEqual(10);
    expect(resets.every((action) => action.destructive)).toBe(true);
    expect(destructive.some((action) => action.name === 'start-sweep')).toBe(false);
    expect(catalog.dangerousMethods.map((method) => method.method)).toEqual([
      'miIO.ota',
      'miIO.config_router',
    ]);
  });

  it('proposes standard capabilities with consistent value maps', () => {
    const proposals = [...catalog.properties, ...catalog.actions].flatMap((entry) =>
      entry.capability === null ? [] : [{ entry, capability: entry.capability }],
    );
    expect(proposals.map(({ capability }) => capability.key)).toEqual(
      expect.arrayContaining([
        'cleaning',
        'suction',
        'mop_level',
        'battery',
        'child_lock',
        'volume',
        'filter_life',
      ]),
    );
    const status = findProperty(2, 2);
    const mapped = status?.capability?.valueMap.map((item) => item.value) ?? [];
    expect(mapped).toEqual(status?.values.map((option) => option.value));
    expect(findProperty(21, 6)?.capability).toBeNull();
    expect(findAction(2, 1)?.capability).toMatchObject({
      key: 'cleaning',
      role: 'command',
      value: 'start',
    });
  });

  it('holds no token, address, account number or cloud object name', () => {
    const text = JSON.stringify(catalog);
    expect(text).not.toMatch(/\b[0-9a-f]{32}\b/);
    expect(text).not.toMatch(
      /\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/,
    );
    expect(text).not.toMatch(/(?:[0-9a-f]{2}:){5}[0-9a-f]{2}/i);
    expect(text).not.toMatch(/\d{8,}\/\d+\/\d+/);
    expect(text).not.toMatch(/token|passToken|ssid/i);
  });

  it('is rejected by its schema when a capability key is not a standard one', () => {
    const broken: unknown = JSON.parse(
      JSON.stringify(catalog).replace('"key":"cleaning"', '"key":"raw:2.2"'),
    );
    expect(VACUUM_CATALOG.safeParse(broken).success).toBe(false);
  });

  it('returns null for an address the catalog does not hold', () => {
    expect(findProperty(99, 1)).toBeNull();
    expect(findAction(99, 1)).toBeNull();
    expect(findEvent(99, 1)).toBeNull();
    expect(pv11glCatalog()).toBe(catalog);
  });
});

describe('the proven wire forms recorded on the catalog', () => {
  const room = vacuumAction('vacuum', 'start-vacuum-room-sweep');
  const zone = vacuumAction('vacuum', 'start-zone-sweep');

  it('records the piid-tagged room clean as the live result', () => {
    expect(room.live).toMatchObject({
      accepted: true,
      inputTried: '[{"piid":15,"value":"[3,4]"}]',
    });
    expect(room.live?.effect).toMatch(/sweep-type 2\.5 becomes 3/);
    expect(room.danger).toMatch(/-9999/);
    expect(room.danger).toMatch(/plain value/);
  });

  it('records the piid-tagged zone clean as the live result', () => {
    expect(zone.live).toMatchObject({
      accepted: true,
      inputTried:
        '[{"piid":12,"value":"[{\\"blocks_region\\":[-500,300,-500,-300,500,-300,500,300],\\"blocks_attr\\":0}]"}]',
    });
    expect(zone.live?.effect).toMatch(/sweep-type 2\.5 becomes 2/);
    expect(zone.danger).toMatch(/plain value/);
  });
});

describe('accessors by name', () => {
  it('finds entries by service and name and tells the two brush services apart', () => {
    expect(vacuumProperty('vacuum', 'status')).toBe(findProperty(2, 2));
    expect(vacuumProperty('streamManagement', 'on')).toBe(findProperty(21, 6));
    expect(vacuumAction('vacuum', 'start-vacuum-room-sweep')).toBe(findAction(2, 16));
    expect(vacuumEvent('vacuum', 'dry-complete')).toBe(findEvent(2, 5));
    expect(vacuumProperty('mainBrush', 'brush-life-level').siid).toBe(12);
    expect(vacuumProperty('sideBrush', 'brush-life-level').siid).toBe(13);
  });

  it('throws a named error for a name the catalog does not hold', () => {
    expect(() => vacuumProperty('vacuum', 'no-such-property')).toThrow(VacuumCatalogError);
    expect(() => vacuumAction('battery', 'start-sweep')).toThrow(/no action named start-sweep/);
    expect(() => vacuumEvent('roller', 'x')).toThrow(/service roller/);
  });

  it('names every service of the catalog', () => {
    const ids = new Set<number>(Object.values(VACUUM_SERVICE_ID));
    expect(catalog.services.every((service) => ids.has(service.siid))).toBe(true);
    expect(
      [...catalog.properties, ...catalog.actions, ...catalog.events].every((entry) =>
        ids.has(entry.siid),
      ),
    ).toBe(true);
  });
});

describe('the status table', () => {
  it('holds the 25 values of the spec with the official labels by list position', () => {
    const table = vacuumStatusTable();
    expect(table).toHaveLength(25);
    expect(table.map((entry) => entry.value)).toEqual([
      ...Array.from({ length: 21 }, (_, index) => index + 1),
      24,
      25,
      26,
      27,
    ]);
    expect(table.map((entry) => entry.label)).toEqual([
      'Standby',
      'Charging',
      'Recharging to resume',
      'Working',
      'Pausing',
      'Returning',
      'Cleaning the mop',
      'Remote controlling',
      'Fully charged',
      'Mapping',
      'Updating',
      'Station working(cleaning)',
      'Switching tasks',
      'Station working(charging)',
      'Error',
      'Sweeping and Mopping',
      'Mopping',
      'Pausing map creation',
      'Returning to recharge',
      'Returning midway',
      'Returning after mapping',
      'Returning',
      'Self-checking',
      'Summoning',
      'Cleaning Summoned Area',
    ]);
    expect(vacuumStatus(9)).toEqual({ value: 9, spec: 'Charged', label: 'Fully charged' });
    expect(vacuumStatus(22)).toBeNull();
    expect(table.map((entry) => entry.value)).toEqual(
      findProperty(2, 2)?.capability?.valueMap.map((item) => item.value),
    );
  });
});

describe('the fault table', () => {
  const faults = vacuumFaultTable();

  it('holds the 127 codes of the official plugin: 86 errors and 41 alerts', () => {
    expect(faults).toHaveLength(127);
    expect(faults.filter((fault) => fault.type === 'error')).toHaveLength(86);
    expect(faults.filter((fault) => fault.type === 'alert')).toHaveLength(41);
    expect(new Set(faults.map((fault) => fault.code)).size).toBe(127);
  });

  it('types the carpet notice as an alert and the failed return as an error', () => {
    expect(vacuumFault(100051)).toMatchObject({
      type: 'alert',
      title: 'Carpet vacuuming starts first',
    });
    const returning = vacuumFault(210009);
    expect(returning?.type).toBe('error');
    expect(returning?.detail).toHaveLength(3);
    expect(returning?.handledButton).toBe(false);
    expect(vacuumFault(210010)?.dockVariant).toEqual({
      title: "Couldn't reposition",
      message: 'Please return the robot vacuum to the charging dock',
    });
    expect(vacuumFault(1)).toBeNull();
  });

  it('holds only English text without translation markers', () => {
    const text = JSON.stringify(faults);
    expect(text).not.toMatch(/from zh/);
    expect(text).not.toMatch(/[\u3400-\u9fff]/);
  });
});

describe('the safety classes', () => {
  const addressOf = (entry: { siid: number; aiid: number }): string =>
    `${String(entry.siid)}.${String(entry.aiid)}`;
  const classOf = (siid: number, aiid: number): string => actionSafety(vacuumActionAt(siid, aiid));

  function vacuumActionAt(siid: number, aiid: number): ReturnType<typeof vacuumAction> {
    const found = findAction(siid, aiid);
    if (found === null) {
      throw new Error(`missing action ${String(siid)}.${String(aiid)}`);
    }
    return found;
  }

  it('gives every property, action and event exactly one class', () => {
    const classes = [...catalog.properties, ...catalog.actions, ...catalog.events].map(
      vacuumSafety,
    );
    expect(classes).toHaveLength(191 + 101 + 5);
    const count = (name: string): number => classes.filter((item) => item === name).length;
    expect(count('destructive')).toBe(30);
    expect(count('never-in-tests')).toBe(2 + 5);
    expect(count('read-only') + count('safe-physical')).toBe(classes.length - 37);
  });

  it('marks the cases of the safety classification of the research', () => {
    expect(vacuumSafety(vacuumProperty('streamManagement', 'on'))).toBe('never-in-tests');
    expect(vacuumSafety(vacuumProperty('vacuumMap', 'map-upload-stop'))).toBe('never-in-tests');
    expect(vacuumSafety(vacuumProperty('vacuum', 'status'))).toBe('read-only');
    expect(vacuumSafety(vacuumEvent('vacuum', 'sweep-complete'))).toBe('read-only');
    for (const [siid, aiid] of [
      [10, 3],
      [15, 1],
      [20, 7],
      [20, 9],
      [21, 7],
    ] as const) {
      expect(classOf(siid, aiid)).toBe('never-in-tests');
    }
    for (const [siid, aiid] of [
      [2, 10],
      [2, 11],
      [2, 30],
      [2, 47],
      [10, 7],
      [20, 1],
      [20, 5],
      [20, 10],
    ] as const) {
      expect(classOf(siid, aiid)).toBe('read-only');
    }
    for (const [siid, aiid] of [
      [2, 1],
      [2, 16],
      [2, 37],
      [2, 18],
      [6, 1],
      [24, 2],
      [2, 45],
    ] as const) {
      expect(classOf(siid, aiid)).toBe('safe-physical');
    }
  });

  it('marks every reset, deletion, factory and split or merge action destructive', () => {
    const destructive = catalog.actions.filter((action) => actionSafety(action) === 'destructive');
    expect(destructive.map(addressOf)).toEqual(
      expect.arrayContaining([
        '9.1',
        '10.1',
        '10.2',
        '10.8',
        '12.1',
        '24.1',
        '2.14',
        '2.15',
        '20.11',
      ]),
    );
    expect(destructive.every((action) => action.destructive)).toBe(true);
  });
});

describe('consumables and the station', () => {
  it('lists the seven consumables with level, time left and a destructive reset', () => {
    const consumables = vacuumConsumables();
    expect(consumables.map((item) => item.id)).toEqual([
      'main-brush',
      'side-brush',
      'filter',
      'mop',
      'detergent',
      'dust-bag',
      'roller',
    ]);
    for (const item of consumables) {
      expect(item.level.siid).toBe(VACUUM_SERVICE_ID[item.service]);
      expect(item.level.range).toEqual([0, 100, 1]);
      expect(item.leftTime.unit).toBe('hours');
      expect(actionSafety(item.reset)).toBe('destructive');
    }
  });

  it('lists the station functions with the actions and events proven on the robot', () => {
    const functions = vacuumStationFunctions();
    const byId = (id: string): (typeof functions)[number] | undefined =>
      functions.find((item) => item.id === id);
    expect(functions).toHaveLength(5);
    expect(byId('mop-wash')).toMatchObject({ doneEvent: 4, mode: 3 });
    expect(byId('mop-wash')?.start).toBe(findAction(2, 19));
    expect(byId('mop-wash')?.stop).toBe(findAction(2, 31));
    expect(byId('roller-wash')?.start).toBe(findAction(24, 2));
    expect(byId('roller-wash')?.stop).toBe(findAction(24, 3));
    expect(byId('dry')?.stop).toBe(findAction(2, 32));
    expect(byId('dust-collection')?.stop).toBeNull();
    expect(byId('eject')?.mode).toBeNull();
    expect(functions.every((item) => actionSafety(item.start) === 'safe-physical')).toBe(true);
    expect(functions.flatMap((item) => (item.doneEvent === null ? [] : [item.doneEvent]))).toEqual([
      3, 4, 4, 5,
    ]);
  });

  it('names the station modes and tells the ones seen live from the plugin only', () => {
    expect(STATION_MODES.filter((mode) => mode.seenLive).map((mode) => mode.name)).toEqual([
      'idle',
      'dry',
      'dust-collection',
      'mop-wash',
    ]);
    expect(vacuumStationMode(7)?.name).toBe('rewash');
    expect(vacuumStationMode(6)).toBeNull();
  });

  it('marks the edge sweep frequency absent on the pv11gl and nothing else', () => {
    const absent = pv11glCatalog().properties.filter((entry) => entry.absentOnDevice === true);
    expect(absent.map((entry) => [entry.siid, entry.piid])).toStrictEqual([[2, 68]]);
    expect(isAbsentOnDevice(2, 68)).toBe(true);
    expect(isAbsentOnDevice(2, 74)).toBe(false);
    expect(isAbsentOnDevice(99, 1)).toBe(false);
  });
});
