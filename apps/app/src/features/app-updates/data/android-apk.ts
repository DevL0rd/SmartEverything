import {
  API_ENDPOINTS as E,
  type AndroidApkRelease,
  type NativeAndroidUpdateProgress,
  type NativeAndroidUpdateResult,
} from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  cancelNativeAndroidUpdate,
  installNativeAndroidUpdate,
  requestAndroidUpdatePermission,
} from '../../../api/connection/media-resources';
import { api, useConnection } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useValue, ValueStore } from '../../../design/external-store';
import { appPlatform } from '../../../design/platform';
import { rawErrorText } from '../../../format/errors';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { localPref, setLocalPref } from '../../../store/local-prefs';
import { useSyncStatus } from '../../../store/selectors';
import { RELEASE_UPDATE_CHANNEL } from '../model/adapter';
import type { InstallerStage } from '../model/apk-offer';
import { androidBuild } from './android-build';

const log = new Logger('app.app-updates');

export const ANDROID_APK_OFFER_KEY = ['app-updates', 'android-apk'] as const;

const IDLE: InstallerStage = { kind: 'idle' };

export const installerStage = new ValueStore<InstallerStage>(IDLE);

export const NO_PERMISSION_REASON =
  'Android needs permission to install updates. Turn on Allow from this source, then try again.';

const CHANGED_REASON = 'This update changed on your home. Check it again.';

export function useAndroidApkOffer(): UseQueryResult<AndroidApkRelease | null> {
  const connection = useConnection();
  const live = useSyncStatus().status === 'live';
  const build = appPlatform() === 'android' && !__DEV__ ? androidBuild() : undefined;
  const home = connection.status === 'paired' ? connection.connection.url : null;
  return useScreenQuery({
    queryKey: [...ANDROID_APK_OFFER_KEY, home, build],
    enabled: live && home !== null && build !== undefined,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async ({ signal }) => {
      if (home === null || build === undefined) return null;
      const offer = await api().call(
        E.readAndroidApkOffer,
        { query: { ...build, channel: RELEASE_UPDATE_CHANNEL } },
        { signal },
      );
      return offer?.release ?? null;
    },
  });
}

function sameOffer(selected: AndroidApkRelease, current: AndroidApkRelease): boolean {
  return (
    current.id === selected.id &&
    current.build.applicationId === selected.build.applicationId &&
    current.build.versionCode === selected.build.versionCode &&
    current.size === selected.size &&
    current.sha256 === selected.sha256
  );
}

class ApkInstallFailure extends Error {
  override readonly name = 'ApkInstallFailure';
}

export function stageOfProgress(
  progress: Omit<NativeAndroidUpdateProgress, 'id'>,
  url: string,
): InstallerStage {
  return {
    kind: progress.stage,
    progress: Math.min(1, progress.received / progress.total),
    url,
  };
}

export function failureReasonOf(result: NativeAndroidUpdateResult): string | null {
  if (result.result !== 'failed') return null;
  return result.message === null
    ? `Android didn’t install the update (status ${String(result.status)}).`
    : `Android didn’t install the update: ${result.message}`;
}

async function installerUrl(
  release: AndroidApkRelease,
  refresh: () => Promise<void>,
): Promise<string> {
  const build = androidBuild();
  if (build === undefined) throw new ApkInstallFailure('This app couldn’t read its Android build.');
  const client = api().forMedia();
  const offer = await client.call(E.readAndroidApkOffer, {
    query: { ...build, channel: RELEASE_UPDATE_CHANNEL },
  });
  if (offer === null || !sameOffer(release, offer.release)) {
    await refresh();
    throw new ApkInstallFailure(CHANGED_REASON);
  }
  const { url, expiresAt } = offer.download;
  return client.resourceUrl(url, expiresAt, 'attachment');
}

async function openAndroidInstaller(
  release: AndroidApkRelease,
  refresh: () => Promise<void>,
): Promise<NativeAndroidUpdateResult> {
  const home = api();
  if (!(await requestAndroidUpdatePermission())) throw new ApkInstallFailure(NO_PERMISSION_REASON);
  if (api() !== home)
    throw new ApkInstallFailure('Your home connection changed. Check for updates again.');
  installerStage.set({ kind: 'preparing' });
  const url = await installerUrl(release, refresh);
  setLocalPref('androidInstall', {
    versionCode: release.build.versionCode,
    appVersion: release.appVersion,
  });
  return installNativeAndroidUpdate(
    url,
    { releaseId: release.id, build: release.build, size: release.size, sha256: release.sha256 },
    (progress) => {
      installerStage.set(stageOfProgress(progress, url));
    },
  );
}

function settleResult(result: NativeAndroidUpdateResult): void {
  if (result.result === 'installed') {
    installerStage.set(IDLE);
    return;
  }
  setLocalPref('androidInstall', null);
  const reason = failureReasonOf(result);
  if (reason === null) {
    installerStage.set(IDLE);
    notify({ message: 'Update cancelled', detail: 'Press Update to install it later.' });
    return;
  }
  log.warn('android_apk.install_rejected', { reason });
  installerStage.set({ kind: 'failed', reason });
}

function failureOf(error: unknown): string {
  return error instanceof ApkInstallFailure
    ? error.message
    : `The update couldn’t be installed: ${rawErrorText(error)}`;
}

export async function installAndroidApk(
  release: AndroidApkRelease,
  refresh: () => Promise<void>,
): Promise<void> {
  const stage = installerStage.get().kind;
  if (stage !== 'idle' && stage !== 'failed') return;
  installerStage.set({ kind: 'permission' });
  try {
    settleResult(await openAndroidInstaller(release, refresh));
  } catch (error) {
    log.error('android_apk.install_failed', error);
    setLocalPref('androidInstall', null);
    installerStage.set({ kind: 'failed', reason: failureOf(error) });
  }
}

export function cancelAndroidApk(): void {
  const stage = installerStage.get();
  if (stage.kind !== 'downloading' && stage.kind !== 'verifying') return;
  background(cancelNativeAndroidUpdate(stage.url), 'android_apk.cancel_failed');
}

export function settleAndroidInstall(): void {
  const installing = localPref('androidInstall');
  if (installing === null) return;
  setLocalPref('androidInstall', null);
  if (androidBuild()?.versionCode !== installing.versionCode) return;
  log.info('android_apk.installed', { versionCode: installing.versionCode });
  notify({
    message: 'SmartEverything updated',
    detail: `Version ${installing.appVersion} is installed.`,
  });
}

export interface AndroidApkInstall {
  readonly stage: InstallerStage;
  readonly install: () => void;
  readonly cancel: () => void;
}

export function useAndroidApkInstall(
  release: AndroidApkRelease | null | undefined,
): AndroidApkInstall {
  const query = useQueryClient();
  return {
    stage: useValue(installerStage),
    cancel: cancelAndroidApk,
    install: (): void => {
      if (release === null || release === undefined) return;
      background(
        installAndroidApk(release, () =>
          query.invalidateQueries({ queryKey: ANDROID_APK_OFFER_KEY }),
        ),
        'android_apk.install_failed',
      );
    },
  };
}
