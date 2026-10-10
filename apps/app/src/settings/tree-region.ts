import { CLIENT_PREFS, REGIONS } from '@smarteverything/domain';
import type { StoreState } from '../store/state';
import type { SettingsPageDefinition } from './types';

function regionSummary(state: StoreState): string | null {
  const read = CLIENT_PREFS.region.decode(
    state.tables.layouts.byId[CLIENT_PREFS.region.storageKey]?.layout ?? null,
  );
  if (read.status === 'invalid') {
    return null;
  }
  return read.value.region === 'auto' ? 'Automatic' : REGIONS[read.value.region].name;
}

export const REGION_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'region',
    title: 'Region & currency',
    icon: 'globe',
    parent: null,
    group: 'App',
    summary: regionSummary,
    keywords: ['country', 'currency', 'money', 'exchange rate', 'dollars', 'euro', 'locale'],
  },
];
