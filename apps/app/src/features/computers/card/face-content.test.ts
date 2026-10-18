import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComputerLiveNotice } from '@smarteverything/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameClass } from '../../../components/widget-board';
import type { Device, DeviceValues } from '../../../store/state';

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const shared = (initial: unknown): object => ({
    value: initial,
    get: () => initial,
    set: (): undefined => undefined,
  });
  return {
    ...original,
    cancelAnimation: (): undefined => undefined,
    useAnimatedStyle: (): object => ({}),
    useAnimatedProps: (): object => ({}),
    useAnimatedReaction: (): undefined => undefined,
    useDerivedValue: (compute: () => unknown): object => shared(compute()),
    useSharedValue: (initial: unknown): object => shared(initial),
    useReducedMotion: (): boolean => true,
    withTiming: (value: unknown): unknown => value,
  };
});

vi.mock('react-native-gesture-handler', async (importOriginal) => {
  const chain: () => unknown = () => new Proxy(chain, { get: () => chain, apply: () => chain() });
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    Gesture: chain(),
    GestureDetector: (props: { children?: ReactNode }): ReactNode => props.children,
  };
});

vi.mock('../../../platform/haptics', () => ({ selectionTick: (): undefined => undefined }));
vi.mock('../../devices', () => ({ useLastSeen: (): null => null }));
vi.mock('../../../store/computer-backfill', () => ({
  useRingBackfill: (): undefined => undefined,
}));

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { CommandLedger } = await import('../../../store/command-ledger');
const { EntityStore } = await import('../../../store/entity-store');
const { StoreProvider } = await import('../../../store/store-context');
const { deviceFixture, stateFixture } = await import('../../../store/device-fixture');
const { COLOUR_VARIABLE, PaletteContext } = await import('../../../design/colour-roles');
const { computerLive } = await import('../../../store/computer-live');
const { ScreenPause, ScreenPausedContext } = await import('../../../design/screen-pause');
const { ComputerFace } = await import('./computer-faces');

const DEVICE = '00000000-0000-4000-8000-0000000000c1';
const AT = '2026-10-17T14:02:00.000Z';
const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });

function computer(options: { readonly online: boolean; readonly hub?: boolean }): Device {
  const action = { kind: 'action' } as const;
  return deviceFixture(0, {
    id: DEVICE,
    kind: 'computer',
    model: options.hub === true ? 'smarteverything.computer.hub' : 'smarteverything.computer',
    online: options.online,
    capabilities: [
      {
        key: 'volume',
        label: 'Volume',
        access: 'read_write',
        value: { kind: 'number', min: 0, max: 100, step: 1 },
      },
      { key: 'mute', label: 'Mute', access: 'read_write', value: { kind: 'boolean' } },
      { key: 'lock_screen', label: 'Lock', access: 'write', value: action },
      { key: 'sleep', label: 'Sleep', access: 'write', value: action },
      { key: 'wake', label: 'Wake', access: 'write', value: action },
    ],
    details: { os: 'Linux', portable: true },
  });
}

function notice(gpu: boolean): ComputerLiveNotice {
  return {
    type: 'computer_live',
    deviceId: DEVICE,
    at: AT,
    parts: {
      summary: {
        cpuLoad: 22,
        cpuTemperature: 46,
        memoryPercent: 41,
        swapPercent: 3,
        gpuLoad: gpu ? 60 : null,
        gpuTemperature: gpu ? 70 : null,
        gpuMemoryPercent: gpu ? 56 : null,
        cpuWatts: 30,
        gpuWatts: gpu ? 110 : null,
        downloadRate: 7_700_000,
        uploadRate: 120_000,
        fullestDisk: { mount: '/', percent: 63 },
        batteryLevel: null,
        charging: null,
        totalWatts: 140,
        processCount: 412,
        uptimeSeconds: 1000,
      },
      session: {
        at: AT,
        user: 'dana',
        locked: false,
        focused: null,
        volume: 42,
        muted: false,
        media: null,
      },
    },
  };
}

const HELD: DeviceValues = {
  cpu_load: { value: 12, observedAt: AT },
  gpu_load: { value: 30, observedAt: AT },
  cpu_temperature: { value: 51, observedAt: AT },
  gpu_temperature: { value: 60, observedAt: AT },
  memory_used: { value: 40, observedAt: AT },
  download_rate: { value: 2_000_000, observedAt: AT },
};

function html(cls: FrameClass, device: Device, values: DeviceValues = {}): string {
  const store = new EntityStore();
  store.update(() => ({ ...stateFixture([device], { [device.id]: values }), loaded: true }));
  const tree = createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(
      PaletteContext,
      { value: PALETTE },
      createElement(
        ScreenPausedContext,
        { value: new ScreenPause(null) },
        createElement(ComputerFace, { device, cls }),
      ),
    ),
  );
  return renderToStaticMarkup(
    createElement(() =>
      StoreProvider({ runtime: { store, ledger: new CommandLedger(store) }, children: tree }),
    ),
  );
}

function count(markup: string, text: string): number {
  return markup.split(text).length - 1;
}

function live(gpu: boolean): void {
  computerLive.store(DEVICE).set({ at: null, parts: {} });
  computerLive.receive(notice(gpu));
}

afterEach(() => {
  computerLive.store(DEVICE).set({ at: null, parts: {} });
});

describe('computer card faces', () => {
  it('shows four different readings on the large card with a graphics card', () => {
    live(true);
    const markup = html('l', computer({ online: true }));
    for (const label of [
      'CPU 22 percent, 46 degrees',
      'GPU 60 percent, 70 degrees',
      'RAM 41 percent',
    ]) {
      expect(count(markup, `aria-label="${label}"`)).toBe(1);
    }
    expect(count(markup, 'aria-label="Download 7.7 megabytes per second"')).toBe(1);
  });

  it('shows three different readings without a graphics card, never the processor twice', () => {
    live(false);
    const markup = html('l', computer({ online: true }));
    expect(count(markup, 'aria-label="CPU 22 percent, 46 degrees"')).toBe(1);
    expect(markup.includes('aria-label="GPU')).toBe(false);
    expect(count(markup, 'aria-label="RAM 41 percent"')).toBe(1);
    expect(count(markup, 'aria-label="Download')).toBe(1);
  });

  it('keeps Lock, Sleep and the sound controls on the large and tall cards', () => {
    live(true);
    for (const cls of ['l', 'xl'] as const) {
      const markup = html(cls, computer({ online: true }));
      expect(markup.includes('Lock')).toBe(true);
      expect(markup.includes('Sleep')).toBe(true);
      expect(markup.includes('aria-label="Mute Device 0"')).toBe(true);
    }
  });

  it('never offers one-tap Sleep on the hub', () => {
    live(true);
    const markup = html('l', computer({ online: true, hub: true }));
    expect(markup.includes('Lock')).toBe(true);
    expect(markup.includes('Sleep')).toBe(false);
  });

  it('keeps Wake on every offline card that can wake the computer', () => {
    for (const cls of ['xs', 'm', 'w', 'l', 'xl'] as const) {
      const markup = html(cls, computer({ online: false }), HELD);
      expect(markup.includes('Wake')).toBe(true);
    }
  });

  it('shows the last readings greyed while the computer is offline', () => {
    const markup = html('l', computer({ online: false }), HELD);
    expect(markup.includes('aria-label="CPU 12 percent, 51 degrees"')).toBe(true);
    expect(markup.includes('aria-label="GPU 30 percent, 60 degrees"')).toBe(true);
    expect(markup.includes('aria-label="RAM 40 percent"')).toBe(true);
    expect(markup.includes('aria-label="Download 2.0 megabytes per second"')).toBe(true);
    expect(markup.includes('Lock')).toBe(false);
  });

  it('dims the bars and keeps the readings of an offline computer on the wide card', () => {
    const markup = html('w', computer({ online: false }), HELD);
    expect(markup.includes('aria-label="CPU 12 percent, 51 degrees"')).toBe(true);
    expect(markup.includes('Live charts return')).toBe(false);
  });

  it('always shows processor and graphics load with temperature, and memory, on every class', () => {
    live(true);
    for (const cls of ['s', 'xs', 'm', 'w', 'l', 'xl'] as const) {
      const markup = html(cls, computer({ online: true }));
      const seen = [
        'CPU 22 percent',
        'GPU 60 percent',
        'RAM 41 percent',
        '46 degrees',
        '70 degrees',
      ];
      for (const text of seen)
        expect([cls, text, markup.includes(text)]).toEqual([cls, text, true]);
    }
  });

  it('shows the last temperatures too while offline', () => {
    for (const cls of ['s', 'xs', 'm', 'w', 'l', 'xl'] as const) {
      const markup = html(cls, computer({ online: false }), HELD);
      for (const text of ['51 degrees', '60 degrees', 'RAM 40 percent']) {
        expect([cls, text, markup.includes(text)]).toEqual([cls, text, true]);
      }
    }
  });
});
