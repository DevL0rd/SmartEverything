import { beforeEach, expect, it, vi } from 'vitest';
import type { AppPlatform } from '../../../design/platform';

interface Platform {
  kind: AppPlatform;
  bridge: object | null;
}

const platform = vi.hoisted((): Platform => ({ kind: 'web', bridge: null }));
const settled = vi.hoisted(() => vi.fn());

vi.mock('../../../design/platform', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  appPlatform: (): AppPlatform => platform.kind,
  desktopBridge: (): object | null => platform.bridge,
}));
vi.mock('../../../design/animation-gate', () => ({ useForeground: (): boolean => true }));
vi.mock('../../../store/selectors', () => ({ useSyncStatus: (): object => ({}) }));
vi.mock('./native-updates', () => ({
  nativeUpdateAdapter: (): Promise<{ readonly platform: 'android' }> =>
    Promise.resolve({ platform: 'android' }),
}));
vi.mock('./android-apk', () => ({ settleAndroidInstall: settled }));
vi.mock('./desktop-updates', () => ({
  desktopUpdateAdapter: (): { readonly platform: 'desktop'; readonly app: 'installer' } => ({
    platform: 'desktop',
    app: 'installer',
  }),
}));

const { adapterForPlatform } = await import('./update-host');

beforeEach(() => {
  settled.mockClear();
  platform.kind = 'web';
  platform.bridge = null;
});

it('gives the browser an unsupported adapter that explains why', async () => {
  const adapter = await adapterForPlatform();
  await expect(adapter.start()).resolves.toEqual({
    kind: 'unsupported',
    reason: 'Updates over the air are for the Android and desktop apps',
  });
});

it('fails loudly when the desktop app has no update bridge', async () => {
  platform.kind = 'desktop';
  await expect(adapterForPlatform()).rejects.toThrow(
    'The desktop app started without its update bridge.',
  );
});

it('uses the desktop adapter when the bridge is present', async () => {
  platform.kind = 'desktop';
  platform.bridge = {};
  await expect(adapterForPlatform()).resolves.toMatchObject({ platform: 'desktop' });
});

it('uses the native adapter on Android and reports a finished app install first', async () => {
  platform.kind = 'android';
  await expect(adapterForPlatform()).resolves.toMatchObject({ platform: 'android' });
  expect(settled).toHaveBeenCalledOnce();
});
