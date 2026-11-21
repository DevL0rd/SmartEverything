import { act, createElement, isValidElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ComputerLiveNotice, DiskUsage } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bars = vi.hoisted((): { readonly progress: number[] } => ({ progress: [] }));

const passThrough = vi.hoisted(
  () =>
    function passThrough(props: { readonly children?: unknown }): ReactNode {
      const children = props.children;
      if (Array.isArray(children)) return children.filter(isValidElement);
      return isValidElement(children) ? children : null;
    },
);

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AppState: {
    currentState: 'active',
    addEventListener: (): { remove: () => undefined } => ({ remove: (): undefined => undefined }),
  },
  View: passThrough,
}));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/card', () => ({ Card: passThrough }));
vi.mock('../../../components/badge', () => ({ Badge: (): null => null }));
vi.mock('../../../components/button', () => ({ Button: (): null => null }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/sheet', () => ({ Sheet: (): null => null }));
vi.mock('../../../components/charts', () => ({
  ProgressBar: ({ progress }: { readonly progress: number }): null => {
    bars.progress.push(progress);
    return null;
  },
}));
vi.mock('../../../design/visibility', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOnScreen: (): { visible: boolean; onLayout: undefined } => ({
    visible: true,
    onLayout: undefined,
  }),
}));
vi.mock('../../../design/size-class', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSizeClass: (): { width: string } => ({ width: 'regular' }),
}));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => 0 }));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({ status: 'live' }),
}));
vi.mock('../../devices', () => ({ useLastSeen: (): null => null }));
vi.mock('../data', () => ({ useMyDrive: (): null => null }));
vi.mock('./mount-toggle', () => ({ MountToggle: (): null => null }));
vi.mock('./placement-row', () => ({ PlacementRow: (): null => null }));
vi.mock('./placement-sheet', () => ({ PlacementSheet: (): null => null }));
vi.mock('../../computers', async () => {
  const list = await import('../../computers/model/computer-list');
  const metrics = await import('../../computers/data/computer-metrics');
  return {
    Ident: (): null => null,
    homeUsageOf: list.homeUsageOf,
    osLineOf: (): string => 'Linux',
    useComputerSelect: metrics.useComputerSelect,
    usePlacesData: (): { data: { home: string } } => ({ data: { home: '/home/me' } }),
    useReach: (): { scope: boolean } => ({ scope: true }),
  };
});

const { deviceFixture } = await import('../../../store/device-fixture');
const { computerLive } = await import('../../../store/computer-live');
const { liveWatch } = await import('../../../store/live-watch');
const { ComputerCard } = await import('./computer-card');

const DEVICE = '00000000-0000-4000-8000-0000000000d1';
const AT = '2026-11-21T10:00:00.000Z';
const TOTAL = 1_000_000_000_000;

function usage(usedBytes: number): DiskUsage {
  return {
    mount: '/',
    device: '/dev/nvme0n1p2',
    label: null,
    filesystem: 'btrfs',
    usedBytes,
    totalBytes: TOTAL,
  };
}

function activity(readRate: number): ComputerLiveNotice {
  return {
    type: 'computer_live',
    deviceId: DEVICE,
    at: AT,
    parts: {
      disks: {
        disks: [{ ...usage(400_000_000_000), readRate, writeRate: readRate, temperature: 40 }],
      },
    },
  };
}

function capacity(usedBytes: number): ComputerLiveNotice {
  return {
    type: 'computer_live',
    deviceId: DEVICE,
    at: AT,
    parts: { disk_usage: { disks: [usage(usedBytes)] } },
  };
}

let root: Root | null = null;

function mount(): void {
  const device = { ...deviceFixture(0, { kind: 'computer' }), id: DEVICE, online: true };
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  act(() => {
    created.render(createElement(ComputerCard, { device, placements: [] }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  bars.progress.length = 0;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  computerLive.store(DEVICE).set({ at: null, parts: {} });
  vi.unstubAllGlobals();
});

describe('drive computer card disk bar', () => {
  it('watches disk usage only, not the per second disk activity', () => {
    mount();
    expect([...liveWatch.topicsOf(DEVICE)]).toEqual(['disk_usage']);
  });

  it('draws the bar from disk usage and ignores disk activity frames', () => {
    mount();
    act(() => {
      computerLive.receive(capacity(400_000_000_000));
    });
    expect(bars.progress).toEqual([0.4]);
    act(() => {
      for (let second = 1; second <= 30; second += 1) computerLive.receive(activity(second));
    });
    expect(bars.progress).toEqual([0.4]);
    act(() => {
      computerLive.receive(capacity(410_000_000_000));
    });
    expect(bars.progress).toEqual([0.4, 0.41]);
  });
});
