import type { AndroidAppBuild, AndroidApkRelease } from '@smarteverything/domain';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  cancelAndroidApk,
  installAndroidApk,
  installerStage,
  settleAndroidInstall,
  NO_PERMISSION_REASON,
} from './android-apk';

const mocks = vi.hoisted(() => {
  const call = vi.fn();
  const resourceUrl = vi.fn();
  const forMedia = vi.fn(() => ({ call, resourceUrl }));
  const home = { forMedia };
  return {
    call,
    resourceUrl,
    forMedia,
    api: vi.fn(() => home),
    permission: vi.fn<() => Promise<boolean>>(),
    install: vi.fn(),
    cancel: vi.fn<(url: string) => Promise<void>>(),
    notify: vi.fn(),
    prefs: new Map<string, unknown>(),
    build: vi.fn((): AndroidAppBuild => ({ applicationId: 'com.example.app', versionCode: '1' })),
    refresh: vi.fn<() => Promise<void>>(),
  };
});

vi.mock('../../../api/transport', () => ({ api: mocks.api }));
vi.mock('../../../api/connection/media-resources', () => ({
  requestAndroidUpdatePermission: mocks.permission,
  installNativeAndroidUpdate: mocks.install,
  cancelNativeAndroidUpdate: mocks.cancel,
}));
vi.mock('../../../components/toast-store', () => ({ notify: mocks.notify }));
vi.mock('../../../store/local-prefs', () => ({
  localPref: (key: string): unknown => mocks.prefs.get(key) ?? null,
  setLocalPref: (key: string, value: unknown): void => {
    mocks.prefs.set(key, value);
  },
}));
vi.mock('../../../queries/use-screen-query', () => ({ useScreenQuery: vi.fn() }));
vi.mock('../../../design/platform', () => ({ appPlatform: (): 'android' => 'android' }));
vi.mock('../../../store/selectors', () => ({ useSyncStatus: vi.fn() }));
vi.mock('./android-build', () => ({ androidBuild: mocks.build }));

const release: AndroidApkRelease = {
  id: '594da1d3-d893-4850-8a70-b8f2eb4d305e',
  clientId: null,
  build: { applicationId: 'com.example.app', versionCode: '2' },
  appVersion: '0.2.0',
  runtimeVersion: 'next-runtime',
  channel: 'release',
  abis: ['arm64-v8a', 'x86_64'],
  notes: 'Fixture',
  createdAt: '2026-11-06T06:00:00.000Z',
  sha256: 'a'.repeat(64),
  size: 512,
};
const download = {
  url: '/media/android-apks/release/shared/update',
  expiresAt: '2026-11-06T06:10:00.000Z',
};
const localUrl = `http://127.0.0.1:40000/resource/${'b'.repeat(64)}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prefs.clear();
  installerStage.set({ kind: 'idle' });
  mocks.permission.mockResolvedValue(true);
  mocks.call.mockResolvedValue({ release, download });
  mocks.resourceUrl.mockResolvedValue(localUrl);
  mocks.install.mockResolvedValue({ result: 'installed' });
  mocks.cancel.mockResolvedValue();
});

it('continues from permission approval with the selected signed offer and its local resource', async () => {
  await installAndroidApk(release, mocks.refresh);
  expect(mocks.permission).toHaveBeenCalledBefore(mocks.call);
  expect(mocks.call).toHaveBeenCalledWith(
    expect.objectContaining({ path: '/api/app-updates/android/apk' }),
    {
      query: { applicationId: 'com.example.app', versionCode: '1', channel: 'release' },
    },
  );
  expect(mocks.resourceUrl).toHaveBeenCalledWith(download.url, download.expiresAt, 'attachment');
  expect(mocks.install).toHaveBeenCalledWith(
    localUrl,
    { releaseId: release.id, build: release.build, size: release.size, sha256: release.sha256 },
    expect.any(Function),
  );
  expect(mocks.notify).not.toHaveBeenCalled();
  expect(mocks.prefs.get('androidInstall')).toEqual({ versionCode: '2', appVersion: '0.2.0' });
});

it('shows each native stage with its progress and cancels a running download', async () => {
  const seen: unknown[] = [];
  const stop = installerStage.subscribe(() => {
    seen.push(installerStage.get());
  });
  mocks.install.mockImplementation(
    async (url: string, _update: unknown, onProgress: (progress: object) => void) => {
      onProgress({ stage: 'downloading', received: 128, total: 512 });
      cancelAndroidApk();
      expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith(url);
      onProgress({ stage: 'verifying', received: 512, total: 512 });
      onProgress({ stage: 'waiting_for_android', received: 512, total: 512 });
      return Promise.resolve({ result: 'cancelled' });
    },
  );
  await installAndroidApk(release, mocks.refresh);
  stop();
  expect(seen).toEqual([
    { kind: 'permission' },
    { kind: 'preparing' },
    { kind: 'downloading', progress: 0.25, url: localUrl },
    { kind: 'verifying', progress: 1, url: localUrl },
    { kind: 'waiting_for_android', progress: 1, url: localUrl },
    { kind: 'idle' },
  ]);
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: 'Update cancelled' }),
  );
  expect(mocks.prefs.get('androidInstall')).toBeNull();
});

it('explains a denied install permission and fetches no installer', async () => {
  mocks.permission.mockResolvedValue(false);
  await installAndroidApk(release, mocks.refresh);
  expect(mocks.call).not.toHaveBeenCalled();
  expect(mocks.install).not.toHaveBeenCalled();
  expect(installerStage.get()).toEqual({ kind: 'failed', reason: NO_PERMISSION_REASON });
});

it.each([null, { release: { ...release, sha256: 'c'.repeat(64) }, download }])(
  'refreshes the banner if the accepted offer is withdrawn or its artifact changes',
  async (changed) => {
    mocks.call.mockResolvedValue(changed);
    await installAndroidApk(release, mocks.refresh);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.resourceUrl).not.toHaveBeenCalled();
    expect(mocks.install).not.toHaveBeenCalled();
    expect(installerStage.get()).toEqual({
      kind: 'failed',
      reason: 'This update changed on your home. Check it again.',
    });
  },
);

it('shows the reason Android gave and permits a fresh attempt', async () => {
  mocks.install.mockResolvedValueOnce({ result: 'failed', status: 3, message: 'Storage is full' });
  await installAndroidApk(release, mocks.refresh);
  expect(installerStage.get()).toEqual({
    kind: 'failed',
    reason: 'Android didn’t install the update: Storage is full',
  });
  mocks.install.mockResolvedValueOnce({ result: 'failed', status: 7, message: null });
  await installAndroidApk(release, mocks.refresh);
  expect(installerStage.get()).toEqual({
    kind: 'failed',
    reason: 'Android didn’t install the update (status 7).',
  });
  expect(mocks.install).toHaveBeenCalledTimes(2);
});

it('tells the person the update installed when the new build comes back', () => {
  mocks.prefs.set('androidInstall', { versionCode: '2', appVersion: '0.2.0' });
  mocks.build.mockReturnValueOnce({ applicationId: 'com.example.app', versionCode: '2' });
  settleAndroidInstall();
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({
    message: 'SmartEverything updated',
    detail: 'Version 0.2.0 is installed.',
  });
  expect(mocks.prefs.get('androidInstall')).toBeNull();
  settleAndroidInstall();
  expect(mocks.notify).toHaveBeenCalledOnce();
});

it('says nothing when the old build comes back', () => {
  mocks.prefs.set('androidInstall', { versionCode: '2', appVersion: '0.2.0' });
  settleAndroidInstall();
  expect(mocks.notify).not.toHaveBeenCalled();
  expect(mocks.prefs.get('androidInstall')).toBeNull();
});
