import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_CLIPBOARD_CHANGED } from '@smarteverything/domain';
import type { ClipboardHandle } from '../src/clipboard-ipc.js';

interface FakeWindow {
  readonly webContents: {
    isDestroyed(): boolean;
    send(channel: string, value: unknown): void;
  };
}

interface State {
  text: string;
  focused: FakeWindow | null;
  destroyed: boolean;
}

const state: State = { text: '', focused: null, destroyed: false };
const sent: { channel: string; value: unknown }[] = [];

vi.mock('electron', () => ({
  clipboard: {
    readText: (): Promise<string> => Promise.resolve(state.text),
    writeText: (value: string): Promise<void> => {
      state.text = value;
      return Promise.resolve();
    },
  },
  BrowserWindow: {
    getFocusedWindow: (): FakeWindow | null => state.focused,
  },
}));

const { registerClipboardIpc } = await import('../src/clipboard-ipc.js');

const handlers = new Map<string, (argument: unknown) => unknown>();
const handle: ClipboardHandle = (channel, handler) => {
  handlers.set(channel, (argument: unknown) => handler(argument));
};

function read(): unknown {
  return handlers.get('desktop:clipboard-read')?.(undefined);
}

function write(text: string): unknown {
  return handlers.get('desktop:clipboard-write')?.(text);
}

function windowWithSink(): FakeWindow {
  return {
    webContents: {
      isDestroyed: (): boolean => state.destroyed,
      send: (channel: string, value: unknown): void => {
        sent.push({ channel, value });
      },
    },
  };
}

const POLL_MS = 5;

async function poll(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, POLL_MS * 4));
}

describe('the desktop clipboard bridge', () => {
  let stop: (() => void) | null = null;

  afterEach(() => {
    stop?.();
    stop = null;
    sent.length = 0;
    state.text = '';
    state.focused = null;
    state.destroyed = false;
  });

  it('reads the system clipboard and answers null when it holds nothing', async () => {
    stop = registerClipboardIpc(handle, POLL_MS);
    state.text = 'copied on this computer';
    expect(await read()).toBe('copied on this computer');
    state.text = '';
    expect(await read()).toBeNull();
  });

  it('puts received text on the system clipboard', async () => {
    stop = registerClipboardIpc(handle, POLL_MS);
    await write('copied on the phone');
    expect(state.text).toBe('copied on the phone');
  });

  it('sends a copy made on this computer to the focused window once', async () => {
    stop = registerClipboardIpc(handle, POLL_MS);
    state.focused = windowWithSink();
    await poll();
    state.text = 'desk copy';
    await poll();
    expect(sent).toStrictEqual([{ channel: DESKTOP_CLIPBOARD_CHANGED, value: 'desk copy' }]);
    sent.length = 0;
    await poll();
    expect(sent).toStrictEqual([]);
  });

  it('does not send back text it has just put on the clipboard itself', async () => {
    stop = registerClipboardIpc(handle, POLL_MS);
    state.focused = windowWithSink();
    await poll();
    await write('from another device');
    await poll();
    expect(sent).toStrictEqual([]);
  });

  it('sends nothing while no window is focused', async () => {
    stop = registerClipboardIpc(handle, POLL_MS);
    state.text = 'copied while the app is behind another window';
    await poll();
    expect(sent).toStrictEqual([]);
  });

  it('sends nothing to a window that is gone', async () => {
    stop = registerClipboardIpc(handle, POLL_MS);
    state.focused = windowWithSink();
    state.destroyed = true;
    state.text = 'copied during shutdown';
    await poll();
    expect(sent).toStrictEqual([]);
  });
});
