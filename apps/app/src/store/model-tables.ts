import type { Snapshot } from '@smarteverything/domain';
import type { NextTable, Tables } from './state';

export function modelTablesOf(
  snapshot: Snapshot,
  next: NextTable,
): Pick<Tables, 'model_assets' | 'model_catalog' | 'model_overrides'> {
  return {
    model_assets: next('model_assets', snapshot.tables.model_assets ?? []),
    model_catalog: next('model_catalog', snapshot.tables.model_catalog ?? []),
    model_overrides: next('model_overrides', snapshot.tables.model_overrides ?? []),
  };
}
