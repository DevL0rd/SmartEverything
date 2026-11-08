import type { MachineUpdateStatus } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useEffect } from 'react';
import { useUpdateStatus } from '../../../api/desktop-update';
import type { DesktopBridge } from '../../../design/platform';
import { useSyncStatus } from '../../../store/selectors';
import { installerNotice } from './installer-notice';

function followInstallerOffers(bridge: DesktopBridge): () => void {
  let checking = false;
  let queued = false;
  let stopped = false;
  const check = (): void => {
    if (stopped) return;
    if (checking) {
      queued = true;
      return;
    }
    checking = true;
    queued = false;
    background(
      bridge.checkForUpdate().finally(() => {
        checking = false;
        if (queued) check();
      }),
      'desktop_update.check_failed',
    );
  };
  const stop = installerNotice.subscribe(check);
  check();
  return (): void => {
    stopped = true;
    stop();
  };
}

export function useDesktopInstaller(bridge: DesktopBridge | null): MachineUpdateStatus | null {
  const { reading } = useUpdateStatus(bridge);
  const live = useSyncStatus().status === 'live';
  useEffect(() => {
    if (bridge === null || !live) return;
    return followInstallerOffers(bridge);
  }, [bridge, live]);
  return reading.kind === 'read' ? reading.status : null;
}
