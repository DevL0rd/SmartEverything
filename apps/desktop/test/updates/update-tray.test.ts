import type {
  AppUpdateCompatible,
  MachineUpdateStatus,
  WebUpdateStatus,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  trayActions,
  updateMenuItems,
  desktopBootMenuItems,
  updateTrayItems,
  webUpdateMenuItems,
} from '../../src/updates/update-tray.js';

const ACTIONS = { check: (): void => undefined, install: (): void => undefined };

function status(overrides: Partial<MachineUpdateStatus>): MachineUpdateStatus {
  return {
    state: 'none',
    progress: null,
    version: null,
    detail: 'No desktop update available.',
    installable: false,
    ...overrides,
  };
}

describe('the update entries in the tray menu', () => {
  it.each(['Connect this computer to your home to get updates.', 'No desktop update available.'])(
    'shows the result before offering another check when nothing is pending',
    (detail) => {
      expect(updateMenuItems(status({ detail }), ACTIONS)).toStrictEqual([
        { label: detail, enabled: false },
        { label: 'Check for desktop updates', click: ACTIONS.check },
      ]);
    },
  );

  it('offers the install when a release can be installed', () => {
    const items = updateMenuItems(
      status({ state: 'available', version: '0.4.2', installable: true }),
      ACTIONS,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      label: 'Install desktop version 0.4.2',
      click: ACTIONS.install,
    });
  });

  it('only informs when the release cannot be installed here', () => {
    const items = updateMenuItems(
      status({ state: 'available', version: '0.4.2', detail: 'Update it elsewhere.' }),
      ACTIONS,
    );
    expect(items).toStrictEqual([{ label: 'Update it elsewhere.', enabled: false }]);
  });

  it.each(['downloading', 'installing'] as const)('shows the progress text while %s', (state) => {
    expect(updateMenuItems(status({ state, detail: 'Working.' }), ACTIONS)).toStrictEqual([
      { label: 'Working.', enabled: false },
    ]);
  });

  it('shows the failure and a way to check again', () => {
    const items = updateMenuItems(status({ state: 'failed', detail: 'Broke.' }), ACTIONS);
    expect(items).toMatchObject([
      { label: 'Broke.', enabled: false },
      { label: 'Check for desktop updates again' },
    ]);
  });
});

const OFFER: AppUpdateCompatible = {
  id: '2f1c7a52-0e0a-4c0e-9c58-1d4f2f6a9b11',
  createdAt: '2026-10-20T00:00:00.000Z',
  appVersion: '1.2.3',
  notes: 'a change',
  size: 1000,
  files: [],
};

const ASK = (): void => undefined;
const RETRY = (): void => undefined;
const ROLL_BACK = (): void => undefined;
const WEB = { askToRestart: ASK, retry: RETRY, rollBack: ROLL_BACK };

describe('the web update entry in the tray menu', () => {
  it('asks to restart once the update is ready, and the click only asks', () => {
    const items = webUpdateMenuItems({ state: 'ready', offer: OFFER }, WEB);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      label: 'Restart for the interface update',
      click: ASK,
    });
    expect(items[0]?.enabled).toBeUndefined();
  });

  it('offers a separate restart action to restore the built-in interface', () => {
    expect(webUpdateMenuItems({ state: 'rollback_ready', currentId: OFFER.id }, WEB)).toStrictEqual(
      [{ label: 'Restart to return to the built-in interface', click: ASK }],
    );
  });

  it('asks the owner to retry or roll back an interface update that did not start', () => {
    expect(
      webUpdateMenuItems({ state: 'boot_failed', failedId: OFFER.id, reason: 'crashed' }, WEB),
    ).toStrictEqual([
      { label: 'The interface update did not start', enabled: false },
      { label: 'Try the interface update again', click: RETRY },
      { label: 'Roll back the interface update', click: ROLL_BACK },
    ]);
  });

  it.each([
    [0, 1000, 'Downloading interface update · 0%'],
    [420, 1000, 'Downloading interface update · 42%'],
    [999, 1000, 'Downloading interface update · 99%'],
    [0, 0, 'Downloading interface update · 0%'],
  ])('shows the percent while downloading (%i of %i)', (received, total, label) => {
    expect(
      webUpdateMenuItems({ state: 'downloading', offer: OFFER, received, total }, WEB),
    ).toStrictEqual([{ label, enabled: false }]);
  });

  it.each<WebUpdateStatus>([
    { state: 'disabled', reason: 'no' },
    { state: 'idle', running: { id: 'embedded', createdAt: '2026-10-01T00:00:00.000Z' } },
    { state: 'checking' },
    { state: 'available', offer: OFFER },
    { state: 'applying' },
    { state: 'failed', reason: 'broke', offer: null },
  ])('adds nothing while %j', (status) => {
    expect(webUpdateMenuItems(status, WEB)).toStrictEqual([]);
  });
});

describe('a desktop version that did not finish its first start', () => {
  it('asks the owner to keep it or roll back', () => {
    expect(desktopBootMenuItems('0.4.2', { keep: ASK, rollBack: ROLL_BACK })).toStrictEqual([
      { label: 'Desktop version 0.4.2 did not finish its first start', enabled: false },
      { label: 'Keep this desktop version', click: ASK },
      { label: 'Roll back to the previous desktop version', click: ROLL_BACK },
    ]);
  });
});

describe('the tray update section', () => {
  it('lists the installer entry first and the web update entry after it', () => {
    const items = updateTrayItems(
      {
        status: () => status({}),
        check: () => Promise.resolve(status({})),
        install: () => Promise.resolve(status({})),
      },
      { status: () => ({ state: 'ready', offer: OFFER }), ...WEB },
    );

    expect(items.map((item) => item.label)).toStrictEqual([
      'No desktop update available.',
      'Check for desktop updates',
      'Restart for the interface update',
    ]);
  });

  it('installs the offer that is current when the item is clicked', () => {
    const installed: string[] = [];
    let current = status({ state: 'available', version: '0.4.2', installable: true, offerId: 'a' });
    const actions = trayActions({
      status: () => current,
      check: () => Promise.resolve(current),
      install: (offerId) => {
        installed.push(offerId);
        return Promise.resolve(current);
      },
    });
    current = status({ state: 'available', version: '0.4.3', installable: true, offerId: 'b' });
    actions.install();
    expect(installed).toStrictEqual(['b']);
  });

  it('shows the download percentage in the tray', () => {
    expect(
      updateMenuItems(
        status({
          state: 'downloading',
          version: '0.4.2',
          detail: 'Downloading desktop version 0.4.2.',
          progress: { received: 25, total: 100 },
        }),
        ACTIONS,
      ),
    ).toStrictEqual([{ label: 'Downloading desktop version 0.4.2 · 25%', enabled: false }]);
  });
});
