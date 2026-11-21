import { MODEL_REGISTRY } from '@smarteverything/models';
import { builtinModelBatches, seedBuiltinModels } from '../models/builtin-models';
import { BUILTIN_PLUGINS } from '../plugins/builtin';
import type { Store } from '../store/store';

export async function seedModels(store: Store): Promise<void> {
  await seedBuiltinModels(
    {
      replaceAdmitted: (batch, admissions) =>
        store.host.write('modelCatalogReplaceAdmitted', { batch, admissions }),
    },
    builtinModelBatches(MODEL_REGISTRY, BUILTIN_PLUGINS),
  );
}
