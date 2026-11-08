import {
  DEVICE_FAMILIES,
  DEVICE_KINDS,
  FAMILY_DEFAULT_MODELS,
  IR_CATEGORY_DEFAULT_MODELS,
  deviceFamily,
  type DeviceFamily,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BUILTIN_PLUGINS } from '../../apps/hub/src/plugins/builtin';
import { MODEL_REGISTRY } from '../../packages/models/src/registry';

function defaultsOf(family: DeviceFamily): readonly string[] {
  return family === 'ir_remote'
    ? Object.values(IR_CATEGORY_DEFAULT_MODELS)
    : [FAMILY_DEFAULT_MODELS[family]];
}

const ENTRY_SPEC = z.object({
  id: z.string(),
  family: z.enum(DEVICE_FAMILIES).optional(),
  meta: z.object({ aliases: z.array(z.string()).optional() }).optional(),
});

interface KnownModel {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly family: DeviceFamily | undefined;
}

const DECODER = new TextDecoder();

function registryModels(): readonly KnownModel[] {
  return MODEL_REGISTRY.map((spec) => ({
    id: spec.id,
    aliases: spec.meta?.aliases ?? [],
    family: spec.family,
  }));
}

function pluginModels(): readonly KnownModel[] {
  return BUILTIN_PLUGINS.flatMap((plugin) =>
    (plugin.models ?? []).flatMap((entry) => {
      if ('problem' in entry.spec.content) return [];
      const spec = ENTRY_SPEC.parse(JSON.parse(DECODER.decode(entry.spec.content)));
      return [{ id: spec.id, aliases: spec.meta?.aliases ?? [], family: spec.family }];
    }),
  );
}

function knownModels(): readonly KnownModel[] {
  return [...registryModels(), ...pluginModels()];
}

function hasModelId(models: readonly KnownModel[], id: string): boolean {
  return models.some((model) => model.id === id || model.aliases.includes(id));
}

function familyGaps(models: readonly KnownModel[]): ReadonlyMap<DeviceFamily, string> {
  const gaps = new Map<DeviceFamily, string>();
  for (const family of DEVICE_FAMILIES) {
    const missing = defaultsOf(family).filter((id) => !hasModelId(models, id));
    if (missing.length > 0) {
      gaps.set(family, `default model missing: ${missing.join(', ')}`);
    }
  }
  return gaps;
}

function kindGaps(familyProblems: ReadonlyMap<DeviceFamily, string>): readonly string[] {
  return DEVICE_KINDS.flatMap((kind) => {
    const family = deviceFamily({ kind, model: '' });
    return familyProblems.has(family)
      ? [`kind ${kind} (family ${family}): ${familyProblems.get(family) ?? ''}`]
      : [];
  });
}

function pluginGaps(models: readonly KnownModel[]): readonly string[] {
  return BUILTIN_PLUGINS.flatMap((plugin) => {
    const families = plugin.manifest.contributes?.deviceFamilies ?? [];
    if (families.length === 0) return [];
    const id = plugin.manifest.id;
    const own = plugin.models ?? [];
    const problems: string[] = [];
    if (own.length === 0) {
      problems.push(
        `plugin ${id}: makes ${families.join(', ')} devices but contributes no model entries`,
      );
    }
    for (const family of families) {
      const known = DEVICE_FAMILIES.find((candidate) => candidate === family);
      if (known === undefined) {
        problems.push(
          `plugin ${id}: family ${family} is not a device family, so no generic model can cover it`,
        );
      } else if (familyGaps(models).has(known)) {
        problems.push(`plugin ${id}: family ${family} has no generic model`);
      }
    }
    return problems;
  });
}

function entryProblems(): readonly string[] {
  return BUILTIN_PLUGINS.flatMap((plugin) =>
    (plugin.models ?? []).flatMap((entry) => {
      const match = Object.values(entry.match).some((list) => list.length > 0);
      return match ? [] : [`plugin ${plugin.manifest.id}: model ${entry.id} has an empty match`];
    }),
  );
}

function uniqueProblems(models: readonly KnownModel[]): readonly string[] {
  const seen = new Set<string>();
  return models.flatMap((model) => {
    const duplicate = seen.has(model.id);
    seen.add(model.id);
    return duplicate ? [`model id ${model.id} is registered twice`] : [];
  });
}

function aliasProblems(models: readonly KnownModel[]): readonly string[] {
  const ids = new Set(models.map((model) => model.id));
  const owners = new Map<string, string[]>();
  for (const model of models) {
    for (const alias of model.aliases) {
      const list = owners.get(alias) ?? [];
      list.push(model.id);
      owners.set(alias, list);
    }
  }
  return [...owners].flatMap(([alias, by]) => {
    const problems: string[] = [];
    if (ids.has(alias)) problems.push(`alias ${alias} of ${by.join(', ')} is also a model id`);
    if (by.length > 1)
      problems.push(`alias ${alias} resolves to ${String(by.length)} models: ${by.join(', ')}`);
    return problems;
  });
}

function report(title: string, gaps: readonly string[]): string {
  return `${title} (${String(gaps.length)}):\n${gaps.map((gap) => `  - ${gap}`).join('\n')}`;
}

describe('model coverage', () => {
  const models = knownModels();

  it('gives every device family a built-in model', () => {
    const gaps = [...familyGaps(models)].map(([family, why]) => `${family}: ${why}`);
    expect(gaps, report('device families without a model', gaps)).toStrictEqual([]);
  });

  it('gives every device kind a model through its family', () => {
    const gaps = kindGaps(familyGaps(models));
    expect(gaps, report('device kinds without a model', gaps)).toStrictEqual([]);
  });

  it('gives every plugin that makes devices its own model entries and generic cover', () => {
    const gaps = pluginGaps(models);
    expect(gaps, report('plugins without a model', gaps)).toStrictEqual([]);
  });

  it('keeps plugin model entries matchable, ids unique and aliases resolving to one model', () => {
    const problems = [...entryProblems(), ...uniqueProblems(models), ...aliasProblems(models)];
    expect(problems, report('model registration problems', problems)).toStrictEqual([]);
  });

  it('knows a default for every device family', () => {
    expect(Object.keys(FAMILY_DEFAULT_MODELS).sort()).toStrictEqual([...DEVICE_FAMILIES].sort());
  });
});
