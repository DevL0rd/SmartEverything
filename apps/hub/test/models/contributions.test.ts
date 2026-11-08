import type { PluginModelContribution } from '@smarteverything/domain';
import { PLUGIN_MODEL_CONTRIBUTION } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  admitEntry,
  entryFromContribution,
  entryFromSpec,
  MODEL_SPEC_BYTE_LIMIT,
  rejectionDetail,
  type Admission,
  type AdmittedModel,
  type ModelEntry,
} from '../../src/models/contributions';
import { sha256Of } from '../../src/store/repositories/model-assets';
import { jsonBytes, specOf } from './model-fixtures';

const OWNER = 'plugin:wiz';

function declared(overrides: Record<string, unknown> = {}): PluginModelContribution {
  return PLUGIN_MODEL_CONTRIBUTION.parse({
    id: 'dev.fan.example',
    title: 'Example fan',
    version: '1.0.0',
    match: { exact: ['wiz.fan'] },
    spec: 'models/fan.json',
    ...overrides,
  });
}

function admitted(result: Admission): AdmittedModel {
  if ('rejection' in result) throw new Error(result.rejection.problem);
  return result.admitted;
}

function rejection(entry: ModelEntry): { id: string; file: string; problem: string } {
  const result = admitEntry(OWNER, entry);
  if ('rejection' in result) return result.rejection;
  throw new Error('the model was admitted');
}

describe('a model spec', () => {
  it('becomes a catalogue row keyed by the hash of its exact bytes', () => {
    const spec = specOf('dev.fan.example', '1.0.0', {
      meta: { names: { display: 'Fan' }, aliases: ['dev.fan.old'] },
    });
    const bytes = jsonBytes(spec);
    const entry = entryFromContribution(declared({ brands: ['WiZ'] }), { spec: bytes });
    const { row, assets } = admitted(admitEntry(OWNER, entry));
    expect(row).toStrictEqual({
      id: 'dev.fan.example',
      version: '1.0.0',
      owner: OWNER,
      title: 'Example fan',
      category: 'climate',
      match: {
        exact: ['wiz.fan'],
        prefix: [],
        normalised: [],
        product: [],
        hardwareModel: [],
        families: [],
      },
      brands: ['WiZ'],
      aliases: ['dev.fan.old'],
      extras: [],
      spec_sha256: sha256Of(bytes),
    });
    expect(assets).toStrictEqual([{ kind: 'spec', owner: OWNER, bytes }]);
  });

  it('accepts the declared sha256 only when it matches the file', () => {
    const bytes = jsonBytes(specOf());
    const good = entryFromContribution(declared({ specSha256: sha256Of(bytes) }), {
      spec: bytes,
    });
    expect(admitted(admitEntry(OWNER, good)).row.spec_sha256).toBe(sha256Of(bytes));
    const bad = entryFromContribution(declared({ specSha256: sha256Of(new Uint8Array([1])) }), {
      spec: bytes,
    });
    expect(rejection(bad)).toStrictEqual({
      id: 'dev.fan.example',
      file: 'models/fan.json',
      problem: 'does not match the sha256 the manifest declares',
    });
  });

  it('rejects text that is not JSON without echoing it', () => {
    const entry = entryFromContribution(declared(), {
      spec: new TextEncoder().encode('secret {not json'),
    });
    const problem = rejection(entry).problem;
    expect(problem).toContain('not valid UTF-8 JSON');
    expect(problem).not.toContain('secret');
  });

  it('rejects bytes that are not UTF-8', () => {
    const entry = entryFromContribution(declared(), {
      spec: Uint8Array.from([0xff, 0xfe, 0xfd]),
    });
    expect(rejection(entry).problem).toContain('not valid UTF-8 JSON');
  });

  it('rejects an empty file and one over the byte limit before it is parsed', () => {
    const empty = entryFromContribution(declared(), { spec: new Uint8Array() });
    expect(rejection(empty).problem).toBe('is empty');
    const big = entryFromContribution(declared(), {
      spec: new Uint8Array(MODEL_SPEC_BYTE_LIMIT + 1).fill(32),
    });
    expect(rejection(big).problem).toBe(
      `is ${String(MODEL_SPEC_BYTE_LIMIT + 1)} bytes, over the ${String(MODEL_SPEC_BYTE_LIMIT)} byte limit`,
    );
    const edge = entryFromContribution(declared(), {
      spec: new Uint8Array(MODEL_SPEC_BYTE_LIMIT).fill(32),
    });
    expect(rejection(edge).problem).toContain('not valid UTF-8 JSON');
  });

  it('names the failing field of a spec that breaks the schema', () => {
    const bad = { ...specOf(), footprint: { width: -1, depth: 1, height: 1 } };
    const entry = entryFromContribution(declared(), { spec: jsonBytes(bad) });
    expect(rejection(entry).problem).toContain('footprint.width');
  });

  it('rejects an unknown key and an unknown schema major', () => {
    for (const bad of [
      { ...specOf(), onload: 'x' },
      { ...specOf(), schema: 2 },
    ]) {
      const entry = entryFromContribution(declared(), { spec: jsonBytes(bad) });
      expect(rejection(entry).problem).toContain('not a valid model spec');
    }
  });

  it('rejects a spec whose id or version differs from the declaration', () => {
    const other = entryFromContribution(declared(), {
      spec: jsonBytes(specOf('dev.fan.other')),
    });
    expect(rejection(other).problem).toContain('not the declared dev.fan.example');
    const newer = entryFromContribution(declared(), {
      spec: jsonBytes(specOf('dev.fan.example', '2.0.0')),
    });
    expect(rejection(newer).problem).toContain('not the declared 1.0.0');
  });

  it('passes on the reason the loader gave for a file it could not read', () => {
    const entry = entryFromContribution(declared(), {
      spec: { problem: 'leaves the plugin folder' },
    });
    expect(rejection(entry)).toStrictEqual({
      id: 'dev.fan.example',
      file: 'models/fan.json',
      problem: 'leaves the plugin folder',
    });
  });

  it('builds a built-in entry from the spec alone with an empty match', () => {
    const spec = specOf('dev.fan.tower', '1.2.0');
    const { row } = admitted(admitEntry('builtin', entryFromSpec(spec)));
    expect(row.owner).toBe('builtin');
    expect(row.title).toBe('Example fan');
    expect(row.match).toStrictEqual({
      exact: [],
      prefix: [],
      normalised: [],
      product: [],
      hardwareModel: [],
      families: [],
    });
    expect(row.spec_sha256).toBe(sha256Of(new TextEncoder().encode(JSON.stringify(spec))));
  });

  it('hashes a built-in spec the same on every build', () => {
    const first = admitted(admitEntry('builtin', entryFromSpec(specOf()))).row.spec_sha256;
    const second = admitted(admitEntry('builtin', entryFromSpec(specOf()))).row.spec_sha256;
    expect(first).toBe(second);
  });
});

describe('the plugin status detail', () => {
  it('is null without a rejection and names every file and problem otherwise', () => {
    expect(rejectionDetail([])).toBeNull();
    expect(
      rejectionDetail([
        { id: 'dev.a', file: 'a.json', problem: 'is empty' },
        { id: 'dev.b', file: 'b.png', problem: 'is not a PNG or WebP image' },
      ]),
    ).toBe(
      'Model files rejected: a.json (dev.a) is empty; b.png (dev.b) is not a PNG or WebP image',
    );
  });
});
