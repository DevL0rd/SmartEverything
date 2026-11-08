import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPUTER_ROLE_MODELS } from '@smarteverything/domain';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device } from '../../../store/state';
import { ComputersScreen } from './computers-screen';

interface Seen {
  devices: readonly Device[];
  owner: boolean;
  loaded: boolean;
  status: string;
  actions: readonly string[];
  subtitle: string | undefined;
}

const seen = vi.hoisted((): Seen => ({
  devices: [],
  owner: true,
  loaded: true,
  status: 'live',
  actions: [],
  subtitle: undefined,
}));

vi.mock('../../../store/selectors', () => ({
  useDevices: (): readonly Device[] => seen.devices,
  useIsOwner: (): boolean => seen.owner,
  useLoaded: (): boolean => seen.loaded,
  useSyncStatus: (): unknown => ({ status: seen.status }),
}));
vi.mock('../../../components/section-body', () => ({ useFrameBodyWidth: (): number => 1100 }));
vi.mock('../../computers', () => ({ PairComputerSheet: (): null => null }));
vi.mock('../../../components/banner', () => ({
  Banner: ({ title }: { readonly title: string }): ReactNode => createElement('aside', {}, title),
}));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({
    title,
    body,
    action,
  }: {
    readonly title: string;
    readonly body: string;
    readonly action?: ReactNode;
  }): ReactNode => createElement('section', {}, title, body, action),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));
vi.mock('./computer-card', () => ({
  ComputerCard: ({ device }: { readonly device: Device }): ReactNode =>
    createElement('article', {}, device.label),
}));
vi.mock('../components/drive-frame', () => ({
  DriveFrame: ({
    children,
    banner,
    actions,
    subtitle,
  }: {
    readonly children: ReactNode;
    readonly banner?: ReactNode;
    readonly actions?: readonly { readonly label: string }[];
    readonly subtitle?: string;
  }): ReactNode => {
    seen.actions = (actions ?? []).map((action) => action.label);
    seen.subtitle = subtitle;
    return createElement('main', {}, banner, children);
  },
}));

function computer(index: number, label: string, online = true): Device {
  return deviceFixture(index, {
    id: `b0000000-0000-4000-8000-00000000000${String(index)}`,
    kind: 'computer',
    name: label,
    model: COMPUTER_ROLE_MODELS.pc,
    online,
  });
}

function render(top?: ReactNode): string {
  return renderToStaticMarkup(
    createElement(ComputersScreen, top === undefined ? {} : { slots: { top } }),
  );
}

describe('ComputersScreen', () => {
  beforeEach(() => {
    seen.devices = [computer(1, 'Workstation'), computer(2, 'Office PC', false)];
    seen.owner = true;
    seen.loaded = true;
    seen.status = 'live';
  });

  it('shows a card per computer under the top slot with Pair a computer for the owner', () => {
    const html = render(createElement('section', {}, 'mount hero'));
    expect(html.indexOf('mount hero')).toBeLessThan(html.indexOf('Workstation'));
    expect(html.indexOf('Workstation')).toBeLessThan(html.indexOf('Office PC'));
    expect(seen.actions).toEqual(['Pair a computer']);
    expect(seen.subtitle).toBe('2 computers · Office PC offline');
    expect(html).not.toContain('Showing the last known state');
  });

  it('gives a member the cards without the pairing action', () => {
    seen.owner = false;
    const html = render();
    expect(html).toContain('Workstation');
    expect(seen.actions).toEqual([]);
  });

  it('keeps the cards with a banner while the hub is offline', () => {
    seen.status = 'offline';
    const html = render();
    expect(html).toContain('Showing the last known state');
    expect(html).toContain('Office PC');
  });

  it('asks to pair a computer when there is none, and tells a member who pairs them', () => {
    seen.devices = [deviceFixture(3)];
    expect(render()).toContain('Pair a computer to sync library folders');
    seen.owner = false;
    const html = render();
    expect(html).toContain('The owner of the home pairs computers');
    expect(html).not.toContain('Pair a computer');
  });

  it('shows the skeleton until the home has loaded', () => {
    seen.loaded = false;
    const html = render();
    expect(html).toContain('aria-busy');
    expect(html).not.toContain('Workstation');
  });
});
