import { setImmediate } from 'node:timers/promises';
import { MODEL_OWNER, PLUGIN_MANIFEST, type ModelSpec } from '@smarteverything/domain';
import type { BuiltinPlugin } from '../plugins/builtin/contract';
import type { ModelBatch, ModelBatchResult, ModelCatalogService } from './catalog-service';
import { admitEntry, entryFromSpec, type Admission, type ModelEntry } from './contributions';

export const BUILTIN_MODEL_OWNER = 'builtin';

export function registryEntryOf(spec: ModelSpec): ModelEntry {
  return entryFromSpec(spec, { match: { normalised: [...(spec.meta?.aliases ?? [])] } });
}

export function builtinModelBatches(
  registry: readonly ModelSpec[],
  plugins: readonly BuiltinPlugin[],
): readonly ModelBatch[] {
  return [
    { owner: BUILTIN_MODEL_OWNER, entries: registry.map(registryEntryOf) },
    ...plugins.map((plugin) => ({
      owner: `plugin:${PLUGIN_MANIFEST.parse(plugin.manifest).id}`,
      entries: plugin.models ?? [],
    })),
  ];
}

async function admissionsOf(batch: ModelBatch): Promise<readonly Admission[]> {
  const owner = MODEL_OWNER.parse(batch.owner);
  const admissions: Admission[] = [];
  for (const entry of batch.entries) {
    admissions.push(admitEntry(owner, entry));
    await setImmediate();
  }
  return admissions;
}

export async function seedBuiltinModels(
  service: Pick<ModelCatalogService, 'replaceAdmitted'>,
  batches: readonly ModelBatch[],
): Promise<readonly ModelBatchResult[]> {
  const results: ModelBatchResult[] = [];
  for (const batch of batches) {
    results.push(service.replaceAdmitted(batch, await admissionsOf(batch)));
  }
  return results;
}
