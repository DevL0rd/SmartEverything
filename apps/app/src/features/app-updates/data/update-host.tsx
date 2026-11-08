import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Logger } from '@smarteverything/logging';
import { connectionState } from '../../../api/connection/connection';
import { useForeground } from '../../../design/animation-gate';
import { appPlatform, desktopBridge } from '../../../design/platform';
import { useSyncStatus } from '../../../store/selectors';
import { unsupportedAdapter, type UpdateAdapter } from '../model/adapter';
import { safeReason } from '../model/safe-reason';
import { busyNow, watchBusy } from './busy';
import { appUpdatePrefs, changeAppUpdatePrefs } from './update-prefs';
import { desktopUpdateAdapter } from './desktop-updates';
import {
  readAppUpdateKey,
  readAppUpdateOffer,
  reportAndroidAppBuild,
  reportAppUpdateOutcome,
} from './hub-offer';
import { nativeUpdateAdapter } from './native-updates';
import { settleAndroidInstall } from './android-apk';
import { AppUpdateController } from './update-controller';
import { activeUpdateController } from './update-store';
import { askToRestart, pendingRestart, settleRestart } from './restart-confirmation';

const log = new Logger('app.app-updates');

const BROWSER_REASON = 'Updates over the air are for the Android and desktop apps';

export function adapterForPlatform(): Promise<UpdateAdapter> {
  const platform = appPlatform();
  if (platform === 'android') {
    settleAndroidInstall();
    return nativeUpdateAdapter({
      readOffer: readAppUpdateOffer,
      readKey: readAppUpdateKey,
      reportBuild: reportAndroidAppBuild,
    });
  }
  if (platform === 'web') return Promise.resolve(unsupportedAdapter('desktop', BROWSER_REASON));
  const bridge = desktopBridge();
  if (bridge === null) {
    return Promise.reject(new Error('The desktop app started without its update bridge.'));
  }
  return Promise.resolve(desktopUpdateAdapter(bridge));
}

function currentToken(): string | null {
  const connection = connectionState.get();
  return connection.status === 'paired' ? connection.connection.token : null;
}

function controllerOf(adapter: UpdateAdapter): AppUpdateController {
  return new AppUpdateController({
    adapter,
    report: reportAppUpdateOutcome,
    prefs: appUpdatePrefs,
    changePrefs: changeAppUpdatePrefs,
    token: currentToken,
    busy: busyNow,
    ask: askToRestart,
    now: Date.now,
  });
}

function useController(): AppUpdateController | null {
  const [controller, setController] = useState<AppUpdateController | null>(null);
  useEffect(() => {
    let stopped = false;
    const isStopped = (): boolean => stopped;
    let stopBusy = (): void => undefined;
    let stopConfirm = (): void => undefined;
    adapterForPlatform()
      .then(async (adapter) => {
        if (isStopped()) return;
        const created = controllerOf(adapter);
        await created.start();
        if (isStopped()) return;
        activeUpdateController.set(created);
        stopBusy = watchBusy((busy) => {
          created.busyChanged(busy);
        });
        stopConfirm = created.listenForConfirmRequests();
        setController(created);
      })
      .catch((error: unknown) => {
        log.error('app_update.host_start_failed', error);
      });
    return (): void => {
      stopped = true;
      stopBusy();
      stopConfirm();
      settleRestart(pendingRestart.get(), false);
      activeUpdateController.set(null);
    };
  }, []);
  return controller;
}

export async function restartViaUpdates(): Promise<void> {
  const updates = await import('expo-updates');
  await updates.reloadAsync();
}

export function AppUpdateHost(): ReactNode {
  const controller = useController();
  const live = useSyncStatus().status === 'live';
  const foreground = useForeground();
  const checked = useRef<AppUpdateController | null>(null);
  useEffect(() => {
    if (!live) checked.current = null;
    if (controller === null || !live || !foreground || checked.current === controller) return;
    checked.current = controller;
    controller.check('live').catch((error: unknown) => {
      log.warn('app_update.live_check_failed', { reason: safeReason(error, null) });
    });
  }, [controller, live, foreground]);
  return null;
}
