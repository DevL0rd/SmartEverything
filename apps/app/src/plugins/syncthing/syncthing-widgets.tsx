import type { WidgetDefinition } from '../../components/widget-board';
import { SYNC_WIDGET_SIZES } from './widgets/frame-faces';
import { SyncWidget } from './widgets/sync-widget';

export const SYNCTHING_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'syncthing-sync',
    title: 'Sync',
    icon: 'folderSync',
    group: 'Files',
    sizes: SYNC_WIDGET_SIZES,
    defaultSize: 'M',
    render: () => <SyncWidget />,
  },
];
