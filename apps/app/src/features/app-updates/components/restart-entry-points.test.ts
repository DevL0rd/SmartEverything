import { act, createContext, createElement, use, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest';
import type { AppUpdateSummary } from '@smarteverything/domain';
import { askToRestart, pendingRestart, settleRestart } from '../data/restart-confirmation';
import { AppUpdateController } from '../data/update-controller';
import type { AppUpdatePrefs } from '../data/update-prefs';
import { activeUpdateController } from '../data/update-store';
import type { UpdateAdapter } from '../model/adapter';
import type { CheckOutcome } from '../model/update-state';
import { ROLLBACK_CONFIRM } from '../model/update-copy';
import { AppUpdatesScreen } from './app-updates-screen';
import { AppUpdateBanner } from './update-banner';

type Surface = 'settings' | 'banner';

const SurfaceContext = createContext<Surface>('settings');
const buttons: Record<Surface, Map<string, () => void>> = {
  settings: new Map(),
  banner: new Map(),
};

interface Children {
  readonly children: ReactNode;
}

function ChildrenOnly({ children }: Children): ReactNode {
  return children;
}

function TestPressable({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress?: () => void;
}): null {
  const actions = buttons[use(SurfaceContext)];
  useLayoutEffect(() => {
    if (onPress === undefined) return undefined;
    actions.set(label, onPress);
    return (): void => {
      actions.delete(label);
    };
  }, [actions, label, onPress]);
  return null;
}

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  View: ChildrenOnly,
}));
vi.mock('../../../api/transport', () => ({
  useConnection: (): { readonly status: 'unpaired' } => ({ status: 'unpaired' }),
}));
vi.mock('../../../components/update-details', () => ({ UpdateDetails: (): null => null }));
vi.mock('../../../components/interactive', () => ({ Interactive: TestPressable }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/button', () => ({ Button: TestPressable }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../../../components/rows', () => ({ ActionRow: (): null => null }));
vi.mock('../../../components/section', () => ({ List: ChildrenOnly }));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: ChildrenOnly }));
vi.mock('../../../settings/settings-focus', () => ({ useSettingsFocus: (): void => undefined }));
vi.mock('../../../design/platform', () => ({
  desktopBridge: (): null => null,
  isNative: (): boolean => true,
  useIdiom: (): 'touch' => 'touch',
}));
vi.mock('./desktop-installer-rows', () => ({ DesktopInstallerRows: (): null => null }));
vi.mock('../../hub-updates', () => ({ HubUpdateCards: (): null => null }));
vi.mock('./android-apk-offer', () => ({
  AndroidApkOffer: (): null => null,
  AndroidApkBanner: (): null => null,
}));
vi.mock('./desktop-installer-banner', () => ({ DesktopInstallerBanner: (): null => null }));
vi.mock('../../../components/update-progress', () => ({ UpdateProgress: (): null => null }));
vi.mock('../data/android-apk', () => ({
  useAndroidApkOffer: (): { readonly data: null } => ({ data: null }),
}));
vi.mock('../data/desktop-installer', () => ({ useDesktopInstaller: (): null => null }));
vi.mock('../data/update-checks', () => ({
  useUpdateChecks: (): { readonly available: false; readonly installer: null } => ({
    available: false,
    installer: null,
  }),
}));

const OFFER: AppUpdateSummary = {
  id: '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c11',
  createdAt: '2026-10-24T10:00:00.000Z',
  appVersion: '1.4.0',
  notes: 'Faster camera start',
  size: 1024,
};

const OFFERED: CheckOutcome = { compatible: OFFER, newer: null, rollBackToEmbedded: false };
const WITHDRAWN: CheckOutcome = { compatible: null, newer: null, rollBackToEmbedded: true };

function updater(outcome: CheckOutcome = OFFERED): {
  readonly controller: AppUpdateController;
  readonly restart: Mock<UpdateAdapter['restart']>;
} {
  const done = (): Promise<void> => Promise.resolve();
  const restart = vi.fn<UpdateAdapter['restart']>(done);
  const adapter: UpdateAdapter = {
    platform: 'android',
    app: 'apk',
    start: () =>
      Promise.resolve({
        kind: 'started',
        running: { kind: 'embedded', builtAt: null },
        runtimeVersion: 'runtime-a',
        emergency: null,
      }),
    check: () => Promise.resolve(outcome),
    download: done,
    prepareRollback: done,
    restart,
  };
  const controller = new AppUpdateController({
    adapter,
    report: done,
    prefs: (): AppUpdatePrefs => ({ channel: 'release', launchedId: null, pendingId: null }),
    changePrefs: (): void => undefined,
    token: (): null => null,
    busy: (): boolean => false,
    ask: askToRestart,
    now: (): number => Date.parse(OFFER.createdAt),
  });
  return { controller, restart };
}

let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
    settleRestart(pendingRestart.get(), false);
    activeUpdateController.set(null);
  });
  vi.unstubAllGlobals();
});

async function showUpdate(controller: AppUpdateController, download: boolean): Promise<void> {
  await act(async () => {
    activeUpdateController.set(controller);
    root.render([
      createElement(
        SurfaceContext,
        { key: 'settings', value: 'settings' },
        createElement(AppUpdatesScreen),
      ),
      createElement(
        SurfaceContext,
        { key: 'banner', value: 'banner' },
        createElement(AppUpdateBanner),
      ),
    ]);
    await controller.check('button');
    if (download) await controller.download(OFFER.id);
  });
}

async function press(surface: Surface, ...labels: readonly string[]): Promise<void> {
  await act(() => {
    const action = labels
      .map((label) => buttons[surface].get(label))
      .find((candidate) => candidate !== undefined);
    if (action === undefined) throw new Error(`No ${labels.join(' or ')} button in ${surface}`);
    action();
    return Promise.resolve();
  });
}

it('restarts the downloaded update by itself without a second confirmation', async () => {
  const { controller, restart } = updater();
  await showUpdate(controller, true);
  expect(restart).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ target: { kind: 'update', offer: OFFER } }),
  );
  expect(pendingRestart.get()).toBeNull();
  expect(controller.state().kind).toBe('restarting');
});

it.each(['banner', 'settings'] as const)(
  'asks before the withdrawn-update rollback only when Restart is pressed in %s',
  async (surface) => {
    const { controller, restart } = updater(WITHDRAWN);
    await showUpdate(controller, false);
    expect(controller.state().kind).toBe('ready');
    expect(pendingRestart.get()).toBeNull();
    expect(restart).not.toHaveBeenCalled();
    await press(surface, 'Restart');
    expect(pendingRestart.get()).not.toBeNull();
    await press(surface, 'Restart');
    expect(restart).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ target: { kind: 'built_in' } }),
    );
    expect(controller.state().kind).toBe('restarting');
  },
);

it('lets Settings cancel, reopen and settle the same restart shown by the banner', async () => {
  const { controller, restart } = updater(WITHDRAWN);
  await showUpdate(controller, false);
  await press('settings', 'Restart');
  await press('settings', 'Later');
  expect(pendingRestart.get()).toBeNull();
  expect(buttons.banner.has('Restart')).toBe(true);
  expect(restart).not.toHaveBeenCalled();
  await press('settings', 'Restart');
  expect(buttons.settings.has('Restart')).toBe(true);
  expect(buttons.banner.has('Restart')).toBe(true);
  await press('settings', 'Restart');
  expect(restart).toHaveBeenCalledTimes(1);
});

it('offers the Settings restart once the desktop installer confirmation is answered', async () => {
  const { controller, restart } = updater(WITHDRAWN);
  await showUpdate(controller, false);
  await act(() => {
    void askToRestart(ROLLBACK_CONFIRM, 'desktop');
    return Promise.resolve();
  });
  expect(buttons.settings.has('Restart')).toBe(false);
  expect(buttons.settings.has('Restart')).toBe(false);
  expect(restart).not.toHaveBeenCalled();
  await press('banner', 'Later');
  await press('settings', 'Restart');
  await press('settings', 'Restart');
  expect(restart).toHaveBeenCalledTimes(1);
});
