import { PREFS, prefValueOf } from '../store/prefs';
import type { StoreState } from '../store/state';
import type { SettingsPageDefinition } from './types';

function navigationSummary(state: StoreState): string | null {
  return prefValueOf(state, PREFS.navigationDevice).override === null
    ? 'All my devices'
    : 'This device only';
}

export const NAVIGATION_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'appearance/navigation',
    title: 'Navigation',
    icon: 'panelLeft',
    parent: 'appearance',
    group: null,
    summary: navigationSummary,
    keywords: ['navigation', 'bottom bar', 'sidebar', 'pins', 'pinned', 'folders', 'rearrange'],
  },
];
