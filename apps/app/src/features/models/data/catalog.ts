import {
  createModelCatalog,
  createOverrideIndex,
  type ModelCatalog,
  type ModelCatalogRow,
  type ModelOverrideIndex,
  type ModelOverrideRow,
} from '@smarteverything/domain';
import { useMemo } from 'react';
import { useRows } from '../../../store/selectors';

const catalogues = new WeakMap<readonly ModelCatalogRow[], ModelCatalog>();

const overrideIndexes = new WeakMap<readonly ModelOverrideRow[], ModelOverrideIndex>();

export function modelCatalogOf(rows: readonly ModelCatalogRow[]): ModelCatalog {
  const known = catalogues.get(rows);
  if (known !== undefined) return known;
  const built = createModelCatalog(rows);
  catalogues.set(rows, built);
  return built;
}

export function modelOverrideIndexOf(rows: readonly ModelOverrideRow[]): ModelOverrideIndex {
  const known = overrideIndexes.get(rows);
  if (known !== undefined) return known;
  const built = createOverrideIndex(rows);
  overrideIndexes.set(rows, built);
  return built;
}

export function useModelCatalog(): ModelCatalog {
  const rows = useRows('model_catalog');
  return useMemo(() => modelCatalogOf(rows), [rows]);
}

export function useModelOverrides(): ModelOverrideIndex {
  const rows = useRows('model_overrides');
  return useMemo(() => modelOverrideIndexOf(rows), [rows]);
}
