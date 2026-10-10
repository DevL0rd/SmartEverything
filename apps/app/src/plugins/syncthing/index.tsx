import type { AppPlugin } from '../contract';
import { SyncActivitySection } from './activity-section';
import { DevicesSection } from './devices-section';
import { FoldersSection } from './folders-section';
import { SyncSection } from './sync-section';
import { SYNCTHING_PLUGIN } from './syncthing-data';
import { SYNCTHING_WIDGETS } from './syncthing-widgets';

const isFileSync = (device: { readonly kind: string }): boolean => device.kind === 'file_sync';

export const syncthingAppPlugin: AppPlugin = {
  id: SYNCTHING_PLUGIN,
  widgets: SYNCTHING_WIDGETS,
  deviceSections: [
    {
      key: 'sync',
      icon: 'folderSync',
      title: 'Sync status',
      applies: isFileSync,
      render: () => <SyncSection />,
    },
    {
      key: 'folders',
      icon: 'folder',
      title: 'Folders',
      applies: isFileSync,
      render: () => <FoldersSection />,
    },
    {
      key: 'devices',
      icon: 'monitor',
      title: 'Devices',
      applies: isFileSync,
      render: () => <DevicesSection />,
    },
    {
      key: 'files',
      icon: 'activity',
      title: 'File activity',
      applies: isFileSync,
      render: () => <SyncActivitySection />,
    },
  ],
  settings: null,
};
