import { MODEL_REGISTRY } from '@smarteverything/models';
import { builtinModelBatches, seedBuiltinModels } from '../models/builtin-models';
import { ModelCatalogService } from '../models/catalog-service';
import { BUILTIN_PLUGINS } from '../plugins/builtin';
import type { Store } from '../store/store';

export async function seedModels(store: Store): Promise<void> {
  await seedBuiltinModels(
    new ModelCatalogService({ assets: store.modelAssets, catalog: store.modelCatalog }),
    builtinModelBatches(MODEL_REGISTRY, BUILTIN_PLUGINS),
  );
}
