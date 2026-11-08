import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopServiceStatus } from '@smarteverything/domain';
import type { ActionRow, ValueRow } from '../../../components/rows';
import type { List } from '../../../components/section';

type Reading =
  { readonly kind: 'read'; readonly status: DesktopServiceStatus } | { readonly kind: 'reading' };

interface Fixture {
  bridge: object | null;
  reading: Reading;
}

const state: Fixture = { bridge: null, reading: { kind: 'reading' } };

const fixture = vi.hoisted(() => ({
  list: vi.fn<(_: ComponentProps<typeof List>) => ReactNode>(({ children }) => children),
  action: vi.fn<(_: ComponentProps<typeof ActionRow>) => null>(() => null),
  value: vi.fn<(_: ComponentProps<typeof ValueRow>) => null>(() => null),
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: (): object => ({}) }));
vi.mock('../../../queries/use-screen-query', () => ({
  useScreenQuery: (): object => ({ data: true, isError: false, error: null }),
}));
vi.mock('../../../api/desktop-service', () => ({
  useServiceStatus: (): object => ({ reading: state.reading, apply: vi.fn() }),
}));
vi.mock('../../../components/confirm-store', () => ({ confirm: vi.fn() }));
vi.mock('../../../components/rows', () => ({
  ActionRow: fixture.action,
  SwitchRow: (): null => null,
  ValueRow: fixture.value,
}));
vi.mock('../../../components/section', () => ({ List: fixture.list }));
vi.mock('../../../components/toast-store', () => ({ notifyFailure: vi.fn() }));
vi.mock('../../../design/platform', () => ({ desktopBridge: (): object | null => state.bridge }));
vi.mock('../connections-log', () => ({
  connectionsLog: { info: vi.fn(), error: vi.fn() },
  trackConnection: vi.fn(),
}));
vi.mock('../../app-updates', () => ({ DesktopInstallerRows: (): null => null }));

const { ThisComputerRows } = await import('./this-computer');

const RUNNING: DesktopServiceStatus = {
  manager: 'systemd',
  health: 'running',
  installed: true,
  active: true,
  url: 'https://hub.example:8443',
  dataDirectory: '/home/someone/.local/share/SmartEverything-Computer',
  detail: '',
  linger: 'unsupported',
};

function render(bridge: object | null, reading: Reading): void {
  state.bridge = bridge;
  state.reading = reading;
  fixture.list.mockClear();
  fixture.action.mockClear();
  fixture.value.mockClear();
  renderToStaticMarkup(createElement(ThisComputerRows));
}

describe('This computer page rows', () => {
  it('renders nothing outside the Desktop window', () => {
    render(null, { kind: 'read', status: RUNNING });
    expect(fixture.list).not.toHaveBeenCalled();
  });

  it('shows the running service with its controls under Computer service', () => {
    render({}, { kind: 'read', status: RUNNING });
    expect(fixture.list.mock.calls.map(([list]) => list.title)).toEqual(['Computer service']);
    expect(fixture.value.mock.calls.map(([row]) => [row.title, row.value])).toContainEqual([
      'Status',
      'Running',
    ]);
    expect(fixture.action.mock.calls.map(([row]) => row.title)).toEqual([
      'Stop the computer service',
      'Restart the computer service',
      'Uninstall the computer service',
    ]);
  });

  it('shows only the status while the service is still being read', () => {
    render({}, { kind: 'reading' });
    expect(fixture.value.mock.calls.map(([row]) => [row.title, row.value])).toEqual([
      ['Status', 'Reading…'],
    ]);
    expect(fixture.action).not.toHaveBeenCalled();
  });
});

describe('This computer settings page', () => {
  it('is a top-level page shown only in the Desktop window', async () => {
    const { onPlatform, settingsPage } = await import('../../../settings/tree');
    const page = settingsPage('this-computer');
    expect(page).toMatchObject({ title: 'This computer', parent: null, platform: 'desktop' });
    const env = {
      owner: true,
      developer: false,
      availability: {
        hasDevices: false,
        hasClimate: false,
        hasCameras: false,
        hasHealth: false,
        hasScenes: false,
        hasEnergy: false,
        hasSecurity: false,
        hasIr: false,
        hasWatch: false,
        needsAttention: false,
      },
    } as const;
    expect(
      (['desktop', 'android', 'web'] as const).filter(
        (platform) => page !== undefined && onPlatform(page, { ...env, platform }),
      ),
    ).toEqual(['desktop']);
  });
});
