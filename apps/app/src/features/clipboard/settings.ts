import type { SettingContext, SettingDefinition } from '../../settings/types';
import { PREFS, prefValueOf, savePref } from '../../store/prefs';

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'clipboard.shared',
    page: 'clipboard',
    title: 'Share my clipboard between my devices',
    description:
      'Text you copy on one of your phones or computers is put on the clipboard of your others while the app is open. It goes through your server only and is kept in memory until the server restarts.',
    icon: 'copy',
    keywords: ['clipboard', 'copy', 'paste', 'sync', 'share text', 'between devices'],
    scope: 'client',
    control: 'switch',
    read: (state) => prefValueOf(state, PREFS.sharedClipboard).enabled,
    write: (enabled: boolean, context: SettingContext): Promise<void> => {
      savePref(context.store, PREFS.sharedClipboard, { enabled });
      return Promise.resolve();
    },
  },
];
