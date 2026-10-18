import type { AppPlugin } from '../contract';
import { homeWhenDeviceOf } from '../shared/plugin-home';
import { SyncActivitySection } from './activity-section';
import { DevicesSection } from './devices-section';
import { FoldersSection } from './folders-section';
import { SyncCardFace, SyncFace } from './model/sync-face';
import { SyncHeroCard } from './model/sync-hero';
import { SyncNotice } from './model/sync-notice';
import { SyncOverview } from './model/sync-overview';
import { SyncQuickActions } from './quick-actions';
import { SyncSection } from './sync-section';
import { SYNCTHING_PLUGIN, SYNCTHING_WIDGET_ALIASES } from './syncthing-data';
import { SYNCTHING_WIDGETS } from './syncthing-widgets';

const isFileSync = (device: { readonly kind: string }): boolean => device.kind === 'file_sync';

export const syncthingAppPlugin: AppPlugin = {
  id: SYNCTHING_PLUGIN,
  widgets: SYNCTHING_WIDGETS,
  home: homeWhenDeviceOf('file_sync', SYNCTHING_WIDGETS),
  widgetAliases: SYNCTHING_WIDGET_ALIASES,
  deviceCards: [
    {
      key: 'syncthing',
      applies: isFileSync,
      render: (device, size, showRoom) => (
        <SyncFace device={device} size={size} showRoom={showRoom} />
      ),
      cell: (device, frame, size) => <SyncCardFace device={device} frame={frame} size={size} />,
      quick: () => <SyncQuickActions />,
      hero: () => <SyncHeroCard />,
      notice: () => <SyncNotice />,
    },
  ],
  deviceOverviews: [
    {
      key: 'syncthing',
      replacesReadings: true,
      applies: isFileSync,
      render: (device) => <SyncOverview device={device} />,
    },
  ],
  deviceSettings: [],
  deviceSections: [
    {
      key: 'sync',
      order: 1,
      icon: 'folderSync',
      title: 'Sync status',
      applies: isFileSync,
      render: (device, beside) => <SyncSection device={device} beside={beside} />,
    },
    {
      key: 'folders',
      order: 2,
      icon: 'folder',
      title: 'Folders',
      applies: isFileSync,
      render: (device) => <FoldersSection device={device} />,
    },
    {
      key: 'devices',
      order: 3,
      icon: 'monitor',
      title: 'Synced devices',
      applies: isFileSync,
      render: () => <DevicesSection />,
    },
    {
      key: 'files',
      order: 4,
      icon: 'activity',
      title: 'File activity',
      applies: isFileSync,
      render: () => <SyncActivitySection />,
    },
  ],
  settings: null,
};
