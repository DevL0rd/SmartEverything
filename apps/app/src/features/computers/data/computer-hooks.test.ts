import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type AudioState,
  type DisplayState,
  type ProcessRow,
  type WindowRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const answers = vi.hoisted(() => new Map<unknown, unknown>());
const toasts = vi.hoisted((): string[] => []);

vi.mock('../../../api/transport', () => ({
  api: (): { call: (endpoint: unknown) => Promise<unknown> } => ({
    call: (endpoint): Promise<unknown> =>
      answers.has(endpoint)
        ? Promise.resolve(answers.get(endpoint))
        : Promise.reject(new Error('No answer set')),
  }),
}));

vi.mock('../../../components/toast-store', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notify: (toast: { message: string }): number => toasts.push(toast.message),
}));

import { computerLive } from '../../../store/computer-live';
import { useProcessTrail } from '../processes/process-trail';
import { useAudioChange } from './computer-audio';
import { useComputerDisplays } from './computer-displays';
import { useWindowChange } from './computer-windows';

const DEVICE = '0b9f3c2e-3c38-4a4f-9d55-6a1f6d4b2a10';
const roots: ReturnType<typeof createRoot>[] = [];

function mount<T>(use: () => T): () => T {
  const seen: T[] = [];
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  roots.push(root);
  const client = new QueryClient();
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement((): ReactNode => {
          seen.push(use());
          return null;
        }),
      ),
    );
  });
  return (): T => {
    const [latest] = seen.slice(-1);
    if (latest === undefined) throw new Error('Nothing rendered');
    return latest;
  };
}

function notice(at: number, parts: Parameters<typeof computerLive.receive>[0]['parts']): void {
  computerLive.receive({
    type: 'computer_live',
    deviceId: DEVICE,
    at: new Date(at).toISOString(),
    parts,
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  answers.clear();
  toasts.length = 0;
  computerLive.store(DEVICE).set({ at: null, parts: {} });
  vi.unstubAllGlobals();
});

function screens(token: string | null): DisplayState {
  const past = new Date(Date.now() - 1000).toISOString();
  return {
    outputs: [],
    nightLight: { supported: false, mode: 'off', active: false, temperatureKelvin: null },
    pendingRevert:
      token === null ? null : { token, startedAt: past, revertsAt: past, summary: 'Changed' },
  };
}

describe('a display change nobody answered', () => {
  it('hides the keep or revert question and says so once the screen is back', async () => {
    notice(Date.now(), { displays: screens('t1') });
    const view = mount(() => useComputerDisplays(DEVICE, false));
    expect(view().pending?.token).toBe('t1');
    answers.set(E.readComputerDisplays, screens(null));
    await act(async () => {
      view().expire('t1');
      await Promise.resolve();
    });
    expect(view().pending).toBeNull();
    expect(computerLive.store(DEVICE).get().parts.displays?.pendingRevert).toBeNull();
    expect(toasts).toEqual(['Reverted. No answer in 15 s']);
  });

  it('hides the question without a toast while the computer still lists the change', async () => {
    notice(Date.now(), { displays: screens('t1') });
    const view = mount(() => useComputerDisplays(DEVICE, false));
    answers.set(E.readComputerDisplays, screens('t1'));
    await act(async () => {
      view().expire('t1');
      await Promise.resolve();
    });
    expect(view().pending).toBeNull();
    expect(toasts).toEqual([]);
  });
});

describe('changes that answer with the new state', () => {
  it('shows the sound state a change answered with', async () => {
    const state: AudioState = {
      outputs: [
        {
          id: 'out',
          name: 'Speakers',
          kind: 'speakers',
          isDefault: true,
          available: true,
          volume: 30,
          muted: true,
          maxVolume: 150,
          batteryPercent: null,
          usedBy: [],
        },
      ],
      inputs: [],
      apps: [],
    };
    answers.set(E.changeComputerAudio, state);
    const change = mount(() => useAudioChange(DEVICE));
    await act(async () => {
      change()({ action: 'mute', muted: true, kind: 'output' });
      await Promise.resolve();
    });
    expect(computerLive.store(DEVICE).get().parts.audio).toEqual(state);
  });

  it('shows the window list a window change answered with', async () => {
    const window: WindowRow = {
      id: 'w1',
      title: 'Docs',
      app: { id: 'fx', name: 'Firefox' },
      desktop: '1',
      minimised: true,
      focused: false,
    };
    answers.set(E.changeComputerWindow, { windows: [window] });
    const change = mount(() => useWindowChange(DEVICE));
    await act(async () => {
      change().mutate({ window: { ...window, minimised: false }, action: 'minimise' });
      await Promise.resolve();
    });
    expect(computerLive.store(DEVICE).get().parts.windows).toEqual({ windows: [window] });
  });
});

describe('the process trail', () => {
  function row(cpu: number): ProcessRow {
    return {
      pid: 100,
      start: 1,
      ppid: 1,
      name: 'firefox',
      command: 'firefox',
      user: 'dana',
      state: 'running',
      cpu,
      memoryBytes: 1000,
      gpu: null,
      diskRate: 0,
      threads: 4,
      descendants: 0,
      own: true,
    };
  }

  function processes(cpu: number): { processes: Parameters<typeof notice>[1]['processes'] } {
    return { processes: { total: 1, offset: 0, order: ['100:1'], rows: [row(cpu)] } };
  }

  it('adds a point only when the process list changed, not for any other part', () => {
    const START = Date.parse('2026-10-18T10:00:00.000Z');
    notice(START, processes(5));
    const trail = mount(() => useProcessTrail(DEVICE, '100:1'));
    expect(trail().cpu).toHaveLength(1);
    act(() => {
      notice(START + 1000, { summary: undefined });
      notice(START + 2000, processes(5));
    });
    expect(trail().cpu).toHaveLength(1);
    act(() => {
      notice(START + 3000, processes(40));
    });
    expect(trail().cpu.map((point) => point.v)).toEqual([5, 40]);
  });
});
