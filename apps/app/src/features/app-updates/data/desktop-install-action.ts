import { useSyncExternalStore } from 'react';
import { useValue } from '../../../design/external-store';
import type { DesktopBridge } from '../../../design/platform';
import { confirmDesktopInstall } from '../model/desktop-install';
import { busyNow, watchBusy } from './busy';
import { askToRestart, pendingRestart } from './restart-confirmation';

export function useDesktopInstallBlock(): string | null {
  const busy = useSyncExternalStore(watchBusy, busyNow, busyNow);
  const pending = useValue(pendingRestart);
  if (busy) return 'Available after your call';
  return pending === null ? null : 'Answer the update prompt first';
}

export function requestDesktopInstall(
  installUpdate: DesktopBridge['installUpdate'],
  offer: { readonly version: string; readonly id: string },
  restoreFocus?: () => void,
): Promise<void> {
  return confirmDesktopInstall(
    { installUpdate },
    offer,
    (request, source) => askToRestart(request, source, restoreFocus),
    busyNow,
  );
}
