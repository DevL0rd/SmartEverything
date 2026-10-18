import { PREFS, prefOf } from '../store/prefs';
import type { StoreState } from '../store/state';
import type { SettingsPageDefinition } from './types';

function clipboardSummary(state: StoreState): string | null {
  const read = prefOf(state, PREFS.sharedClipboard);
  if (read.status === 'invalid') {
    return null;
  }
  return read.value.enabled ? 'On' : 'Off';
}

export const CLIPBOARD_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'clipboard',
    title: 'Shared clipboard',
    icon: 'copy',
    parent: null,
    group: 'App',
    summary: clipboardSummary,
    keywords: ['clipboard', 'copy', 'paste', 'share text', 'between devices'],
  },
];
