import { useQueryClient } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import { useRef, useState } from 'react';
import { useConnection } from '../../../api/transport';
import { notifyFailure } from '../../../components/toast-store';
import { appPlatform, desktopBridge, type DesktopBridge } from '../../../design/platform';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useHubUpdateSource } from '../../hub-updates';
import { ANDROID_APK_OFFER_KEY } from './android-apk';
import { androidBuild } from './android-build';
import type { AppUpdateActions } from './update-store';
import { holdsUpdate, type AppUpdateState } from '../model/update-state';

const log = new Logger('app.app-updates');

export type CheckBlock = 'unpaired' | 'offline';

interface UpdateChecks {
  readonly available: boolean;
  readonly held: boolean;
  readonly blocked: CheckBlock | null;
  readonly checking: boolean;
  readonly check: () => Promise<void>;
  readonly installer: DesktopBridge | null;
  readonly hubSource: ReturnType<typeof useHubUpdateSource>;
}

function useCheckRun(work: () => Promise<unknown>): Pick<UpdateChecks, 'check' | 'checking'> {
  const pending = useRef(false);
  const [checking, setChecking] = useState(false);
  return {
    checking,
    check: async (): Promise<void> => {
      if (pending.current) return;
      pending.current = true;
      setChecking(true);
      try {
        await work();
      } finally {
        pending.current = false;
        setChecking(false);
      }
    },
  };
}

function blockOf(paired: boolean, live: boolean): CheckBlock | null {
  if (!paired) return 'unpaired';
  return live ? null : 'offline';
}

export function useUpdateChecks(state: AppUpdateState, actions: AppUpdateActions): UpdateChecks {
  const queries = useQueryClient();
  const paired = useConnection().status === 'paired';
  const live = useSyncStatus().status === 'live';
  const owner = useIsOwner();
  const hubSource = useHubUpdateSource();
  const installer = desktopBridge();
  const android = appPlatform() === 'android' && !__DEV__ && androidBuild() !== undefined;
  const canCheckHub = paired && owner;
  const canCheckApk = paired && live && android;
  const held = holdsUpdate(state);
  const run = useCheckRun(() =>
    Promise.all([
      held
        ? undefined
        : actions.check().catch((error: unknown) => {
            log.error('app_update.check_failed', error);
          }),
      canCheckApk
        ? queries.invalidateQueries({ queryKey: ANDROID_APK_OFFER_KEY }).catch((error: unknown) => {
            log.error('android_apk.check_failed', error);
          })
        : undefined,
      installer?.checkForUpdate().catch(notifyFailure('Updates couldn’t be checked')),
      canCheckHub
        ? hubSource.refetch({ cancelRefetch: false }).catch((error: unknown) => {
            log.error('hub_update.source_check_failed', error);
          })
        : undefined,
    ]),
  );
  return {
    held,
    blocked: blockOf(paired, live),
    available: canCheckHub || canCheckApk || installer !== null || state.kind !== 'unsupported',
    checking: run.checking,
    installer,
    hubSource,
    check: run.check,
  };
}
