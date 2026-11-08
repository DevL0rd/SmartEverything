import { PLUGIN_MANIFEST, type ModelSpec } from '@smarteverything/domain';
import type { BuiltinPlugin } from '../plugins/builtin/contract';
import type { ModelBatch, ModelBatchResult, ModelCatalogService } from './catalog-service';
import { entryFromSpec, type ModelEntry } from './contributions';

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

export function seedBuiltinModels(
  service: Pick<ModelCatalogService, 'replace'>,
  batches: readonly ModelBatch[],
): readonly ModelBatchResult[] {
  return batches.map((batch) => service.replace(batch));
}
