import type { NodeKind } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import { unitKinds } from '../program-kinds';
import { migratePrograms, usedKindsOf } from './ledger';
import { persistKindBatch, type KindBatch } from './store';
import type { KindMigration } from './versions';

export interface KindMigrationBatch {
  readonly migrations: readonly KindMigration[];
  readonly kinds: readonly NodeKind[];
}

export const PERSIST_PLUGIN_KINDS_UNIT = storeUnit((store, batch: KindBatch): void => {
  persistKindBatch(store.pluginKinds, batch, () => usedKindsOf(store));
});

export const MIGRATE_PLUGIN_KINDS_UNIT = storeUnit((store, batch: KindMigrationBatch): void => {
  migratePrograms(store, unitKinds(store, batch.kinds), batch.migrations);
});
