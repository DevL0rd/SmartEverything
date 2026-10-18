import type { ReactNode } from 'react';
import { ServiceNotice } from '../../shared/plugin-notice';
import { syncthingNotice, useSyncthingSnapshot } from '../syncthing-data';

export function SyncNotice(): ReactNode {
  const stream = useSyncthingSnapshot();
  return stream.state === 'ready' ? (
    <ServiceNotice pluginId="syncthing" notice={syncthingNotice(stream.value)} />
  ) : null;
}
