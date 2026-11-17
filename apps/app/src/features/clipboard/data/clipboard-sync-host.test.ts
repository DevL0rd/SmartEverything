import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalClipboard } from './local-clipboard';

interface Phone {
  local: string;
  readonly written: string[];
  readonly sent: string[];
  status: string;
  readonly appState: Set<(state: string) => void>;
}

const phone = vi.hoisted((): Phone => ({
  local: '',
  written: [],
  sent: [],
  status: 'live',
  appState: new Set(),
}));

const hubClip = vi.hoisted(() => ({
  read: vi.fn(() =>
    Promise.resolve({
      text: 'copied on the laptop yesterday',
      from: '3f0a1d52-6a37-4c0e-9d3c-8a1c5f7e2b10',
      at: '2026-11-16T10:00:00.000Z',
    }),
  ),
}));

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void): { remove: () => void } => {
      phone.appState.add(listener);
      return {
        remove: (): void => {
          phone.appState.delete(listener);
        },
      };
    },
  },
}));

vi.mock('../../../api/shared-clipboard', () => ({
  readSharedClipboard: hubClip.read,
  writeSharedClipboard: (text: string): Promise<void> => {
    phone.sent.push(text);
    return Promise.resolve();
  },
}));

vi.mock('../../../design/platform', () => ({
  desktopBridge: (): null => null,
  isNative: (): boolean => true,
}));

vi.mock('../../../store/prefs', () => ({
  PREFS: { sharedClipboard: 'shared-clipboard' },
  usePref: (): { status: 'ready'; value: { enabled: boolean } } => ({
    status: 'ready',
    value: { enabled: true },
  }),
}));

vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({ status: phone.status }),
}));

vi.mock('./local-clipboard', () => ({
  localClipboard: (): LocalClipboard => ({
    read: (): Promise<string> => Promise.resolve(phone.local),
    write: (text: string): Promise<void> => {
      phone.written.push(text);
      phone.local = text;
      return Promise.resolve();
    },
    watch: (): (() => void) => () => undefined,
  }),
}));

const { ClipboardSyncHost } = await import('./clipboard-sync-host');
const { receiveSharedClip } = await import('./clipboard-bridge');

let root: Root;

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(status: string): Promise<void> {
  phone.status = status;
  await act(async () => {
    root.render(createElement(ClipboardSyncHost));
    await Promise.resolve();
  });
  await settle();
}

async function resume(): Promise<void> {
  for (const listener of phone.appState) listener('active');
  await settle();
}

beforeEach(() => {
  phone.local = 'what the owner copied before opening the app';
  phone.written.length = 0;
  phone.sent.length = 0;
  hubClip.read.mockClear();
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
  });
  vi.unstubAllGlobals();
});

describe('the shared clipboard on an Android phone', () => {
  it('leaves the clipboard alone when the app opens, resumes and reconnects', async () => {
    await render('live');
    await resume();
    await render('connecting');
    await render('live');
    await resume();
    expect(phone.written).toEqual([]);
    expect(phone.local).toBe('what the owner copied before opening the app');
    expect(phone.sent).toEqual([]);
    expect(hubClip.read).not.toHaveBeenCalled();
  });

  it('still puts text copied on another device on the clipboard while the app is open', async () => {
    await render('live');
    receiveSharedClip({
      text: 'copied on the laptop just now',
      from: '3f0a1d52-6a37-4c0e-9d3c-8a1c5f7e2b10',
      at: '2026-11-17T10:00:00.000Z',
    });
    await settle();
    await resume();
    expect(phone.written).toEqual(['copied on the laptop just now']);
    expect(phone.sent).toEqual([]);
  });

  it('sends what was copied in another app while the app was in the background', async () => {
    await render('live');
    await render('connecting');
    phone.local = 'copied in another app';
    await render('live');
    await resume();
    expect(phone.sent).toEqual(['copied in another app']);
    expect(phone.written).toEqual([]);
  });
});
