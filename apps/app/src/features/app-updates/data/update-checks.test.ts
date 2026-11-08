import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AppUpdateSummary } from '@smarteverything/domain';
import type { AppUpdateState } from '../model/update-state';
import { useUpdateChecks } from './update-checks';

const OFFER: AppUpdateSummary = {
  id: '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c11',
  createdAt: '2026-10-24T10:00:00.000Z',
  appVersion: '1.4.0',
  notes: 'Faster camera start',
  size: 1024,
};

const hooks = vi.hoisted(() => ({
  apk: vi.fn<() => Promise<void>>(),
  hub: vi.fn<() => Promise<void>>(),
  desktop: vi.fn<() => Promise<void>>(),
  ota: vi.fn<() => Promise<void>>(),
  owner: vi.fn<() => boolean>(),
  platform: vi.fn<() => string>(),
  bridge: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: (): object => ({ invalidateQueries: hooks.apk }),
}));
vi.mock('../../../api/transport', () => ({
  useConnection: (): object => ({ status: 'paired' }),
}));
vi.mock('../../../components/toast-store', () => ({ notifyFailure: vi.fn() }));
vi.mock('../../../design/platform', () => ({
  appPlatform: hooks.platform,
  desktopBridge: hooks.bridge,
}));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: hooks.owner,
  useSyncStatus: (): object => ({ status: 'live' }),
}));
vi.mock('../../hub-updates', () => ({
  useHubUpdateSource: (): object => ({ isFetching: false, refetch: hooks.hub }),
}));
vi.mock('./android-apk', () => ({ ANDROID_APK_OFFER_KEY: ['app-updates', 'android-apk'] }));
vi.mock('./android-build', () => ({ androidBuild: (): object => ({ versionCode: 5 }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('__DEV__', false);
  hooks.ota.mockResolvedValue(undefined);
  hooks.apk.mockResolvedValue(undefined);
  hooks.hub.mockResolvedValue(undefined);
  hooks.desktop.mockResolvedValue(undefined);
  hooks.owner.mockReturnValue(true);
  hooks.bridge.mockReturnValue(null);
});

type Checks = ReturnType<typeof useUpdateChecks>;

function checksOf(state: AppUpdateState): Checks {
  const capture = vi.fn<(checks: Checks) => void>();
  function Probe(): null {
    capture(
      useUpdateChecks(state, {
        check: hooks.ota,
        download: vi.fn(),
        retry: vi.fn(),
        restart: vi.fn(),
      }),
    );
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  const checks = capture.mock.calls[0]?.[0];
  if (checks === undefined) throw new Error('The update check did not render.');
  return checks;
}

function checkOf(state: AppUpdateState): () => Promise<void> {
  return checksOf(state).check;
}

it('checks OTA, the Android installer and the hub with one action', async () => {
  hooks.platform.mockReturnValue('android');
  await checkOf({ kind: 'checking' })();
  expect(hooks.ota).toHaveBeenCalledOnce();
  expect(hooks.apk).toHaveBeenCalledWith({ queryKey: ['app-updates', 'android-apk'] });
  expect(hooks.hub).toHaveBeenCalledWith({ cancelRefetch: false });
  expect(hooks.desktop).not.toHaveBeenCalled();
});

it('checks the desktop installer and the hub while an OTA waits to restart', async () => {
  hooks.platform.mockReturnValue('desktop');
  hooks.bridge.mockReturnValue({ checkForUpdate: hooks.desktop, installUpdate: vi.fn() });
  await checkOf({ kind: 'ready', target: { kind: 'built_in' } })();
  expect(hooks.desktop).toHaveBeenCalledOnce();
  expect(hooks.hub).toHaveBeenCalledOnce();
  expect(hooks.ota).not.toHaveBeenCalled();
  expect(hooks.apk).not.toHaveBeenCalled();
});

it('checks the owner hub even when OTA is unsupported', async () => {
  hooks.platform.mockReturnValue('web');
  await checkOf({ kind: 'unsupported', reason: 'Web' })();
  expect(hooks.hub).toHaveBeenCalledOnce();
  expect(hooks.ota).not.toHaveBeenCalled();
});

it('never checks the hub as a member', async () => {
  hooks.platform.mockReturnValue('android');
  hooks.owner.mockReturnValue(false);
  await checkOf({ kind: 'checking' })();
  expect(hooks.hub).not.toHaveBeenCalled();
  expect(hooks.apk).toHaveBeenCalledOnce();
});

it.each(['android', 'desktop'] as const)(
  'waits for the %s installer check and ignores duplicate presses',
  async (platform) => {
    const installer = platform === 'android' ? hooks.apk : hooks.desktop;
    let resolve = (): void => undefined;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    installer.mockReturnValueOnce(pending);
    hooks.platform.mockReturnValue(platform);
    if (platform === 'desktop') {
      hooks.bridge.mockReturnValue({ checkForUpdate: hooks.desktop, installUpdate: vi.fn() });
    }
    const check = checkOf({ kind: 'unsupported', reason: 'OTA unavailable' });
    const finished = vi.fn();
    const first = check().then(finished);
    await check();
    expect(installer).toHaveBeenCalledOnce();
    expect(finished).not.toHaveBeenCalled();
    resolve();
    await first;
    expect(finished).toHaveBeenCalledOnce();
    await check();
    expect(installer).toHaveBeenCalledTimes(2);
  },
);

it.each([
  ['downloading', { kind: 'downloading', offer: OFFER, progress: 0.2 }],
  ['restarting', { kind: 'restarting', target: { kind: 'built_in' } }],
  [
    'a failed restart that kept its update',
    {
      kind: 'failed',
      cause: 'restart',
      reason: 'Offline',
      offer: OFFER,
      target: { kind: 'update', offer: OFFER },
      retrying: false,
      sequence: 1,
    },
  ],
] as const)('reports %s as holding an update and skips the OTA check', async (_, state) => {
  hooks.platform.mockReturnValue('android');
  const checks = checksOf(state);
  expect(checks.held).toBe(true);
  await checks.check();
  expect(hooks.ota).not.toHaveBeenCalled();
});

it('does not hold the check while only a check failed', () => {
  hooks.platform.mockReturnValue('android');
  const failed = {
    kind: 'failed',
    cause: 'check',
    reason: 'Offline',
    offer: null,
    target: null,
    retrying: false,
    sequence: 1,
  } as const;
  expect(checksOf(failed).held).toBe(false);
  expect(checksOf({ kind: 'idle' }).blocked).toBeNull();
});
