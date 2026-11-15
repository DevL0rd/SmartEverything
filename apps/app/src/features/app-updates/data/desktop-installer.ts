import type { MachineUpdateStatus } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useEffect } from 'react';
import { useUpdateStatus } from '../../../api/desktop-update';
import type { DesktopBridge } from '../../../design/platform';
import { useConnection } from '../../../api/transport';
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
  const paired = useConnection().status === 'paired';
  useEffect(() => {
    if (bridge === null || !paired) return;
    return followInstallerOffers(bridge);
  }, [bridge, paired]);
  return reading.kind === 'read' ? reading.status : null;
}
