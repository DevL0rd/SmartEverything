import type { DevicePageContribution } from '../../../app-shell/device-pages';

export const STORAGE_PAGES: readonly DevicePageContribution[] = [
  {
    id: 'storage',
    title: 'Storage',
    subtitle: 'Drives, free space and activity',
    icon: 'layers',
    keywords: ['storage', 'disk', 'drive', 'ssd', 'nvme', 'space', 'full', 'mount', 'filesystem'],
    settings: ['Drives', 'Free space', 'Read and write', 'Open in Files'],
  },
];
