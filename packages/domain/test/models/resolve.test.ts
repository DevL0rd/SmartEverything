import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import * as domain from '../../src';
import { PLUGIN_CONTRIBUTIONS, PLUGIN_MANIFEST } from '../../src/plugins';
import {
  MODEL_CATALOG_ROW,
  MODEL_OVERRIDE_INPUT,
  MODEL_OVERRIDE_ROW,
  PLUGIN_MODEL_CONTRIBUTION,
  createModelCatalog,
  modelIdentityKey,
  type ModelCatalogRow,
} from '../../src/models/catalog';
import { normaliseModelString, type MODEL_MATCH_READ } from '../../src/models/match';
import {
  createOverrideIndex,
  modelDeviceIdentity,
  resolveModel,
  type ModelDevice,
  type ModelResolution,
  type ModelTie,
} from '../../src/models/resolve';

const WHEN = '2026-10-25T10:00:00+07:00';
const HASH = 'a'.repeat(64);

function row(
  id: string,
  match: z.input<typeof MODEL_MATCH_READ>,
  extra: Partial<Record<string, unknown>> = {},
): ModelCatalogRow {
  return MODEL_CATALOG_ROW.parse({
    id,
    version: '1.0.0',
    owner: 'builtin',
    title: id,
    category: 'device',
    match,
    ...extra,
  });
}

function device(overrides: Partial<ModelDevice> & Pick<ModelDevice, 'id' | 'model'>): ModelDevice {
  return { brand: 'smarteverything', family: 'generic', ...overrides };
}

function overrideRow(
  scope: string,
  target: string,
  pick: Record<string, unknown>,
): ReturnType<typeof MODEL_OVERRIDE_ROW.parse> {
  return MODEL_OVERRIDE_ROW.parse({
    scope,
    target,
    model_id: null,
    asset_hash: null,
    finish: null,
    set_by: 'owner',
    updated_at: WHEN,
    ...pick,
  });
}

interface Setup {
  readonly rows?: readonly ModelCatalogRow[];
  readonly overrides?: readonly ReturnType<typeof overrideRow>[];
  readonly kindDefaults?: readonly (readonly [string, string])[];
  readonly irDefaults?: readonly (readonly [string, string])[];
}

function run(subject: ModelDevice, setup: Setup = {}): ModelResolution & { ties: ModelTie[] } {
  const ties: ModelTie[] = [];
  const resolution = resolveModel(
    subject,
    {
      catalog: createModelCatalog(setup.rows ?? []),
      overrides: createOverrideIndex(setup.overrides ?? []),
      defaults: {
        kindDefaults: new Map(setup.kindDefaults ?? []),
        irCategoryDefaults: new Map(setup.irDefaults ?? []),
      },
    },
    { onTie: (tie) => ties.push(tie) },
  );
  return { ...resolution, ties };
}

function mainId(resolution: ModelResolution): string | null {
  return resolution.main?.kind === 'catalogue' ? resolution.main.modelId : null;
}

const PHONES = [
  row('dev.phone.galaxy-z-fold7', { hardwareModel: ['TEST-FOLD7'] }),
  row('dev.tablet.galaxy-tab-s9-ultra', { hardwareModel: ['TEST-TABS9U'] }),
  row('dev.phone.android-generic', { exact: ['smarteverything.android'] }),
];

const ANDROID = { model: 'smarteverything.android', family: 'phone' } as const;

describe('the four phones and tablets that share one model string', () => {
  const fold = device({ id: 'p1', ...ANDROID, hardwareModel: 'TEST-FOLD7' });
  const tablet = device({ id: 'p2', ...ANDROID, hardwareModel: 'TEST-TABS9U' });
  const unknown = device({ id: 'p3', ...ANDROID });
  const emulator = device({ id: 'p4', ...ANDROID, hardwareModel: 'TEST-EMULATOR' });
  const setup = { rows: PHONES, kindDefaults: [['phone', 'dev.phone.android-generic']] } as const;

  it('gives the Fold and the Tab their own models by hardware identifier', () => {
    expect(mainId(run(fold, setup))).toBe('dev.phone.galaxy-z-fold7');
    expect(mainId(run(tablet, setup))).toBe('dev.tablet.galaxy-tab-s9-ultra');
    expect(run(fold, setup).source).toBe('plugin-identity');
  });

  it('gives the phone without a hardware model and the emulator the generic model', () => {
    expect(mainId(run(unknown, setup))).toBe('dev.phone.android-generic');
    expect(mainId(run(emulator, setup))).toBe('dev.phone.android-generic');
    expect(run(emulator, setup).source).toBe('plugin-identity');
  });

  it('falls back to the kind default when no entry matches the hardware', () => {
    const bare = run(emulator, { rows: PHONES.slice(0, 2), kindDefaults: setup.kindDefaults });
    expect(bare.source).toBe('none');
    const withDefault = run(emulator, {
      rows: [...PHONES.slice(0, 2), row('dev.phone.fallback', {})],
      kindDefaults: [['phone', 'dev.phone.fallback']],
    });
    expect([withDefault.source, mainId(withDefault)]).toEqual([
      'kind-default',
      'dev.phone.fallback',
    ]);
  });

  it('keeps one identity key per distinct phone and tablet', () => {
    const keys = [fold, tablet, unknown, emulator].map((d) =>
      modelIdentityKey(modelDeviceIdentity(d)),
    );
    expect(new Set(keys).size).toBe(4);
  });

  it('applies an identity override to one hardware model only', () => {
    const key = modelIdentityKey(modelDeviceIdentity(fold));
    const overrides = [overrideRow('identity', key, { model_id: 'dev.phone.android-generic' })];
    expect(mainId(run(fold, { ...setup, overrides }))).toBe('dev.phone.android-generic');
    expect(run(fold, { ...setup, overrides }).source).toBe('identity-override');
    expect(run(tablet, { ...setup, overrides }).source).toBe('plugin-identity');
  });
});

describe('the laptop', () => {
  const rows = [
    row('dev.computer.laptop-scar-18', { product: ['Laptop Board G834JY_G834JY'] }),
    row('dev.computer.hub-generic', { exact: ['smarteverything.computer.hub'] }),
  ];
  const laptop = device({
    id: 'c1',
    model: 'smarteverything.computer.hub',
    family: 'computer',
    product: 'Laptop Board G834JY_G834JY',
  });

  it('matches on details.product ahead of the generic exact model string', () => {
    const resolution = run(laptop, { rows });
    expect(mainId(resolution)).toBe('dev.computer.laptop-scar-18');
    expect(resolution.candidates).toEqual([
      'dev.computer.laptop-scar-18',
      'dev.computer.hub-generic',
    ]);
    expect(resolution.ties).toEqual([]);
  });

  it('gives a computer with another product the generic model', () => {
    const other = device({ ...laptop, id: 'c2', product: 'Other Board' });
    expect(mainId(run(other, { rows }))).toBe('dev.computer.hub-generic');
  });

  it('keys the identity by the product', () => {
    expect(modelDeviceIdentity(laptop).hardwareModel).toBe('Laptop Board G834JY_G834JY');
  });
});

describe('model strings that change between updates', () => {
  const rows = [
    row('dev.ir.tuya-blaster', { prefix: ['S06ProWB3S'] }),
    row('dev.dns.adguard-home', { prefix: ['AdGuard Home v'] }),
    row('dev.sync.syncthing', { normalised: ['Syncthing'] }),
    row('dev.microwave.samsung', { normalised: ['TP1X_DA-KS-MICROWAVE-01041'] }),
  ];
  const resolve = (model: string): string | null =>
    mainId(run(device({ id: 'x', model }), { rows }));

  it('matches the suffixed Tuya model by prefix', () => {
    expect(resolve('S06ProWB3S新界面')).toBe('dev.ir.tuya-blaster');
    expect(resolve('S06ProWB3S')).toBe('dev.ir.tuya-blaster');
  });

  it('matches AdGuard Home on any version by prefix', () => {
    expect(resolve('AdGuard Home v0.107.78')).toBe('dev.dns.adguard-home');
    expect(resolve('AdGuard Home v0.108.0')).toBe('dev.dns.adguard-home');
  });

  it('matches Syncthing on any version by the normalised string', () => {
    expect(resolve('Syncthing v2.1.6')).toBe('dev.sync.syncthing');
    expect(resolve('Syncthing v3.0.0')).toBe('dev.sync.syncthing');
  });

  it('matches the composite microwave string by its first part', () => {
    expect(resolve('TP1X_DA-KS-MICROWAVE-01041|40475341|5004…')).toBe('dev.microwave.samsung');
    expect(resolve('TP1X_DA-KS-MICROWAVE-01041|99999999|1')).toBe('dev.microwave.samsung');
  });

  it('does not match unrelated strings', () => {
    expect(resolve('Syncthing Lite')).toBeNull();
    expect(resolve('AdGuard Home')).toBeNull();
  });
});

describe('normaliseModelString', () => {
  it('lower-cases, cuts at the bar and drops trailing versions and non-ASCII text', () => {
    expect(normaliseModelString('AdGuard Home v0.107.78')).toBe('adguard home');
    expect(normaliseModelString('Foo 1.2.3')).toBe('foo');
    expect(normaliseModelString('Foo v2')).toBe('foo');
    expect(normaliseModelString('S06ProWB3S新界面')).toBe('s06prowb3s');
    expect(normaliseModelString('X v1.2 新界面')).toBe('x');
    expect(normaliseModelString('a|b|c')).toBe('a');
  });

  it('keeps model numbers that only look like versions', () => {
    expect(normaliseModelString('Xiaomi Watch 5')).toBe('xiaomi watch 5');
    expect(normaliseModelString('v1.2.3')).toBe('v1.2.3');
  });

  it('handles very long adversarial input in one linear pass', () => {
    const hostile = 'v1.'.repeat(100_000) + '|' + '新'.repeat(100_000);
    expect(normaliseModelString(hostile)).toHaveLength(300_000);
    expect(normaliseModelString(`${'a '.repeat(100_000)}v1.2`)).toHaveLength(199_999);
  });
});

describe('resolution priority', () => {
  const subject = device({
    id: 'w1',
    brand: 'wiz',
    model: 'ESP25_SHRGB_01',
    family: 'light',
  });
  const rows = [
    row('dev.light.wiz-bulb', { exact: ['ESP25_SHRGB_01'] }, { brands: ['wiz'] }),
    row('dev.light.family-plugin', { families: ['light'] }),
    row('dev.light.kind-default', {}),
    row('dev.light.device', {}),
    row('dev.light.identity', {}),
    row('dev.light.family', {}),
  ];
  const kindDefaults: [string, string][] = [['light', 'dev.light.kind-default']];
  const key = modelIdentityKey(modelDeviceIdentity(subject));
  const overrides = [
    overrideRow('device', 'w1', { model_id: 'dev.light.device', finish: 'brass' }),
    overrideRow('identity', key, { model_id: 'dev.light.identity' }),
    overrideRow('family', 'light', { model_id: 'dev.light.family', params: { count: 3 } }),
  ];

  it('walks the seven steps in order as higher ones are removed', () => {
    const steps = [
      [overrides, 'device-override', 'dev.light.device'],
      [overrides.slice(1), 'identity-override', 'dev.light.identity'],
      [overrides.slice(2), 'family-override', 'dev.light.family'],
      [[], 'plugin-identity', 'dev.light.wiz-bulb'],
    ] as const;
    for (const [list, source, id] of steps) {
      const resolution = run(subject, { rows, overrides: list, kindDefaults });
      expect([resolution.source, mainId(resolution)]).toEqual([source, id]);
    }
    const noIdentity = run(subject, { rows: rows.slice(1), kindDefaults });
    expect([noIdentity.source, mainId(noIdentity)]).toEqual([
      'plugin-family',
      'dev.light.family-plugin',
    ]);
    const noFamily = run(subject, { rows: rows.slice(2), kindDefaults });
    expect([noFamily.source, mainId(noFamily)]).toEqual(['kind-default', 'dev.light.kind-default']);
    const flat = run(subject, { rows: [] });
    expect([flat.source, flat.main, flat.extras]).toEqual(['none', null, []]);
  });

  it('carries the finish and params of the winning override', () => {
    expect(run(subject, { rows, overrides, kindDefaults })).toMatchObject({ finish: 'brass' });
    const family = run(subject, { rows, overrides: overrides.slice(2), kindDefaults });
    expect(family.params).toEqual({ count: 3 });
    expect(family.finish).toBeUndefined();
  });

  it('uses an uploaded asset hash as the main model', () => {
    const asset = overrideRow('device', 'w1', { asset_hash: HASH });
    expect(run(subject, { rows, overrides: [asset] }).main).toEqual({ kind: 'asset', hash: HASH });
  });

  it('skips an override whose model left the catalogue and says so', () => {
    const missing = overrideRow('device', 'w1', { model_id: 'dev.light.gone' });
    const resolution = run(subject, { rows, overrides: [missing], kindDefaults });
    expect(resolution.source).toBe('plugin-identity');
    expect(resolution.issues).toEqual([
      'device-override: model dev.light.gone is not in the catalogue',
    ]);
  });

  it('skips an unknown kind default and says so', () => {
    const resolution = run(subject, { rows: [], kindDefaults: [['light', 'dev.light.gone']] });
    expect(resolution.source).toBe('none');
    expect(resolution.issues).toHaveLength(1);
  });

  it('does not match a candidate that declares another brand', () => {
    const other = device({
      id: 'w2',
      brand: 'tuya',
      manufacturer: 'Tuya',
      model: 'ESP25_SHRGB_01',
      family: 'light',
    });
    expect(run(other, { rows }).source).toBe('plugin-family');
    const byManufacturer = device({ ...other, id: 'w3', manufacturer: 'WiZ' });
    expect(run(byManufacturer, { rows }).source).toBe('plugin-identity');
  });

  it('takes the IR category default for IR remotes before the kind default', () => {
    const remote = device({ id: 'r1', model: 'ir', family: 'ir_remote', irCategory: 'tv' });
    const resolution = run(remote, {
      rows: [row('dev.ir.tv', {}), row('dev.ir.any', {})],
      kindDefaults: [['ir_remote', 'dev.ir.any']],
      irDefaults: [['tv', 'dev.ir.tv']],
    });
    expect(mainId(resolution)).toBe('dev.ir.tv');
    const other = run(
      { ...remote, irCategory: 'fan' },
      {
        rows: [row('dev.ir.tv', {}), row('dev.ir.any', {})],
        kindDefaults: [['ir_remote', 'dev.ir.any']],
        irDefaults: [['tv', 'dev.ir.tv']],
      },
    );
    expect(mainId(other)).toBe('dev.ir.any');
  });
});

describe('most specific plugin entry wins and ties are logged', () => {
  const subject = device({
    id: 's1',
    model: 'AdGuard Home v0.107.78',
    family: 'dns_filter',
    product: 'P1',
  });

  it('ranks hardware, then exact, then prefix, then normalised', () => {
    const rows = [
      row('dev.t.normalised', { normalised: ['adguard home'] }),
      row('dev.t.prefix', { prefix: ['AdGuard'] }),
      row('dev.t.exact', { exact: ['AdGuard Home v0.107.78'] }),
      row('dev.t.hardware', { product: ['P1'] }),
    ];
    expect(run(subject, { rows }).candidates).toEqual([
      'dev.t.hardware',
      'dev.t.exact',
      'dev.t.prefix',
      'dev.t.normalised',
    ]);
    expect(mainId(run(subject, { rows: rows.slice(0, 3) }))).toBe('dev.t.exact');
    expect(mainId(run(subject, { rows: rows.slice(0, 2) }))).toBe('dev.t.prefix');
  });

  it('prefers the longer prefix', () => {
    const rows = [
      row('dev.t.short', { prefix: ['Ad'] }),
      row('dev.t.long', { prefix: ['AdGuard Home v'] }),
    ];
    expect(mainId(run(subject, { rows }))).toBe('dev.t.long');
  });

  it('breaks a tie by newest version, then owner, and logs it', () => {
    const rows = [
      row('dev.t.old', { exact: ['AdGuard Home v0.107.78'] }, { version: '1.0.0' }),
      row('dev.t.new', { exact: ['AdGuard Home v0.107.78'] }, { version: '1.2.0' }),
    ];
    const resolution = run(subject, { rows });
    expect(mainId(resolution)).toBe('dev.t.new');
    expect(resolution.ties).toEqual([
      { deviceId: 's1', tier: 'exact', winner: 'dev.t.new', rival: 'dev.t.old' },
    ]);
    const owners = [
      row('dev.t.b', { exact: ['AdGuard Home v0.107.78'] }, { owner: 'plugin:bravo' }),
      row('dev.t.a', { exact: ['AdGuard Home v0.107.78'] }, { owner: 'plugin:alpha' }),
    ];
    expect(mainId(run(subject, { rows: owners }))).toBe('dev.t.a');
  });

  it('logs a tie between two plugins that claim the same family and picks one', () => {
    const rows = [
      row('dev.f.one', { families: ['dns_filter'] }, { owner: 'plugin:two' }),
      row('dev.f.two', { families: ['dns_filter'] }, { owner: 'plugin:one' }),
    ];
    const resolution = run({ ...subject, model: 'unknown' }, { rows });
    expect(mainId(resolution)).toBe('dev.f.two');
    expect(resolution.ties).toEqual([
      { deviceId: 's1', tier: 'family', winner: 'dev.f.two', rival: 'dev.f.one' },
    ]);
  });

  it('does not log versions of one model as a tie', () => {
    const rows = [
      row('dev.t.same', { exact: ['AdGuard Home v0.107.78'] }, { version: '1.0.0' }),
      row('dev.t.same', { exact: ['AdGuard Home v0.107.78'] }, { version: '2.0.0' }),
    ];
    const resolution = run(subject, { rows });
    expect(resolution.ties).toEqual([]);
    expect(resolution.candidates).toEqual(['dev.t.same']);
  });
});

describe('roles and aliases', () => {
  const rows = [
    row(
      'dev.vacuum.pv11gl',
      { exact: ['xiaomi.vacuum.pv11gl'] },
      { extras: [{ role: 'dock', modelId: 'dev.vacuum.pv11gl-omni' }] },
    ),
    row('dev.vacuum.pv11gl-omni', {}),
    row(
      'dev.button.xiaomi-wireless-round',
      { exact: ['lumi.sensor_switch.v2'] },
      { aliases: ['dev.button.aqara-round'] },
    ),
  ];

  it('resolves the vacuum to the robot with the station as dock', () => {
    const resolution = run(device({ id: 'v1', model: 'xiaomi.vacuum.pv11gl', family: 'vacuum' }), {
      rows,
    });
    expect(mainId(resolution)).toBe('dev.vacuum.pv11gl');
    expect(resolution.extras).toEqual([{ role: 'dock', modelId: 'dev.vacuum.pv11gl-omni' }]);
  });

  it('finds a model by an alias and resolves an alias override to the real id', () => {
    const catalog = createModelCatalog(rows);
    expect(catalog.find('dev.button.aqara-round')?.id).toBe('dev.button.xiaomi-wireless-round');
    expect(catalog.find('dev.button.xiaomi-wireless-round')?.id).toBe(
      'dev.button.xiaomi-wireless-round',
    );
    expect(catalog.find('dev.button.nothing')).toBeUndefined();
    const aliasOverride = overrideRow('device', 'b1', { model_id: 'dev.button.aqara-round' });
    const resolution = run(device({ id: 'b1', model: 'x', family: 'button' }), {
      rows,
      overrides: [aliasOverride],
    });
    expect(mainId(resolution)).toBe('dev.button.xiaomi-wireless-round');
  });
});

describe('override and catalogue schemas', () => {
  it('needs exactly one of model_id and asset_hash', () => {
    const base = { scope: 'device', target: 'd1', finish: null, set_by: 'o', updated_at: WHEN };
    expect(
      MODEL_OVERRIDE_ROW.safeParse({ ...base, model_id: null, asset_hash: null }).success,
    ).toBe(false);
    expect(
      MODEL_OVERRIDE_ROW.safeParse({ ...base, model_id: 'dev.a.b', asset_hash: HASH }).success,
    ).toBe(false);
    expect(
      MODEL_OVERRIDE_ROW.safeParse({ ...base, model_id: 'dev.a.b', asset_hash: null }).success,
    ).toBe(true);
    expect(MODEL_OVERRIDE_INPUT.safeParse({ scope: 'device' }).success).toBe(false);
    expect(MODEL_OVERRIDE_INPUT.safeParse({ scope: 'family', asset_hash: HASH }).success).toBe(
      true,
    );
    expect(
      MODEL_OVERRIDE_INPUT.safeParse({ scope: 'device', model_id: 'dev.a.b', extra: 1 }).success,
    ).toBe(false);
  });

  it('limits a family override to a real family', () => {
    const base = {
      model_id: 'dev.a.b',
      asset_hash: null,
      finish: null,
      set_by: 'o',
      updated_at: WHEN,
    };
    expect(
      MODEL_OVERRIDE_ROW.safeParse({ ...base, scope: 'family', target: 'light' }).success,
    ).toBe(true);
    expect(
      MODEL_OVERRIDE_ROW.safeParse({ ...base, scope: 'family', target: 'toaster' }).success,
    ).toBe(false);
  });

  it('reads a catalogue row leniently and applies defaults', () => {
    const parsed = MODEL_CATALOG_ROW.parse({
      id: 'dev.a.b',
      version: '1.0.0',
      owner: 'plugin:wiz',
      title: 'A',
      category: 'light',
      match: { exact: ['x'], future: true },
      future: 1,
    });
    expect(parsed).toMatchObject({
      brands: [],
      aliases: [],
      extras: [],
      spec_sha256: null,
    });
  });
});

describe('plugin contributes.models', () => {
  const entry = {
    id: 'dev.light.wiz-bulb',
    title: 'WiZ bulb',
    version: '1.0.0',
    match: { exact: ['ESP25_SHRGB_01'], families: ['light'] },
    spec: 'models/bulb.json',
  };

  it('accepts the shape with a declared spec hash', () => {
    expect(PLUGIN_MODEL_CONTRIBUTION.safeParse({ ...entry, specSha256: HASH }).success).toBe(true);
  });

  it('rejects regexes, unknown keys, empty matches and escaping paths', () => {
    const bad = [
      { ...entry, match: { regex: ['.*'] } },
      { ...entry, match: { exact: ['x'], pattern: '.*' } },
      { ...entry, match: {} },
      { ...entry, match: { exact: [] } },
      { ...entry, extra: true },
      { ...entry, spec: '../outside.json' },
      { ...entry, spec: '/etc/passwd' },
      { ...entry, spec: 'a/../b.json' },
      { ...entry, spec: 'C:\\spec.json' },
      { ...entry, spec: 'a\\b.json' },
      { ...entry, specSha256: 'abc' },
      { ...entry, id: 'wiz-bulb' },
    ];
    for (const value of bad) expect(PLUGIN_MODEL_CONTRIBUTION.safeParse(value).success).toBe(false);
  });

  it('adds an optional models array to contributions with no entry cap', () => {
    expect(PLUGIN_CONTRIBUTIONS.parse({}).models).toEqual([]);
    const many = Array.from({ length: 250 }, (_, index) => ({
      ...entry,
      id: `dev.light.bulb-${String(index)}`,
    }));
    expect(PLUGIN_CONTRIBUTIONS.parse({ models: many }).models).toHaveLength(250);
    expect(
      PLUGIN_CONTRIBUTIONS.safeParse({ models: [{ ...entry, match: { regex: 'x' } }] }).success,
    ).toBe(false);
  });

  it('keeps manifests without models valid', () => {
    const manifest = PLUGIN_MANIFEST.parse({
      id: 'wiz',
      name: 'WiZ',
      version: '1.0.0',
      description: 'WiZ lights',
      publisher: 'x',
    });
    expect(manifest.contributes.models).toEqual([]);
  });
});

describe('module load', () => {
  it('exports the resolver from the domain index', () => {
    expect(typeof domain.resolveModel).toBe('function');
    expect(typeof domain.normaliseModelString).toBe('function');
    expect(domain.MODEL_SOURCES).toHaveLength(7);
  });
});
