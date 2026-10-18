import type { DevicePageContribution } from '../../../app-shell/device-pages';

export const APPS_PAGES: readonly DevicePageContribution[] = [
  {
    id: 'apps',
    title: 'Apps and windows',
    subtitle: 'Open windows, open and close apps',
    icon: 'grid',
    keywords: ['apps', 'windows', 'programs', 'open', 'close', 'minimise', 'front', 'focus'],
    settings: [
      'Open windows',
      'Bring to front',
      'Minimise',
      'Close window',
      'Screenshot this window',
      'Used today',
      'Open an app',
    ],
  },
];
