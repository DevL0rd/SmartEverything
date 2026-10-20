import { useMemo } from 'react';
import type { AutomationFunctionSummary } from '@smarteverything/domain';
import { catalogOf, type CatalogGroup } from './catalog-view';
import { useAutomationsSource } from './source';
import { useFunctions } from './use-functions';

export interface Catalog {
  readonly groups: readonly CatalogGroup[];
  readonly functions: readonly AutomationFunctionSummary[];
  readonly loading: boolean;
  readonly failed: boolean;
}

const NO_FUNCTIONS: readonly AutomationFunctionSummary[] = [];

export function useCatalog(): Catalog {
  const { kinds } = useAutomationsSource();
  const functions = useFunctions();
  const loaded = functions.data ?? NO_FUNCTIONS;
  const groups = useMemo(() => catalogOf(kinds, loaded), [kinds, loaded]);
  return { groups, functions: loaded, loading: functions.isPending, failed: functions.isError };
}
