import type { SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import type { IconName } from '../../../components/icon';
import type { ColourRole } from '../../../design/tokens';
import {
  ServiceWidgetFrame,
  type ServiceReady,
  type ServiceWidget,
} from '../../shared/service-widget-frame';
import { SYNCTHING_PLUGIN, useSyncthingSnapshot } from '../syncthing-data';

export type SyncReady = ServiceReady<SyncthingSnapshot>;

const SYNCTHING_WIDGET: ServiceWidget<SyncthingSnapshot> = {
  pluginId: SYNCTHING_PLUGIN,
  deviceKind: 'file_sync',
  useSnapshot: useSyncthingSnapshot,
  offTitle: 'The Syncthing plugin is off',
  setUpTitle: 'Set up Syncthing',
  setUpIcon: 'folderSync',
  hideRemoveWhenSmall: false,
};

interface SyncWidgetFrameProps {
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly children: (ready: SyncReady) => ReactNode;
}

export function SyncWidgetFrame(props: SyncWidgetFrameProps): ReactNode {
  return <ServiceWidgetFrame service={SYNCTHING_WIDGET} {...props} />;
}
