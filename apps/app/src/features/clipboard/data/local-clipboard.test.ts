import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopClipboard } from '@smarteverything/domain';

interface ExpoState {
  text: string;
  error: Error | null;
  written: string[];
  listeners: Set<() => void>;
}

const expo: ExpoState = {
  text: 'copied in the app',
  error: null,
  written: [],
  listeners: new Set(),
};

let native = false;

vi.mock('expo-clipboard', () => ({
  getStringAsync: (): Promise<string> => {
    if (expo.error !== null) return Promise.reject(expo.error);
    return Promise.resolve(expo.text);
  },
  setStringAsync: (value: string): Promise<void> => {
    expo.written.push(value);
    return Promise.resolve();
  },
  addClipboardListener: (listener: () => void): { remove(): void } => {
    expo.listeners.add(listener);
    return {
      remove: (): void => {
        expo.listeners.delete(listener);
      },
    };
  },
}));

vi.mock('../../../design/platform', () => ({ isNative: (): boolean => native }));

const { localClipboard } = await import('./local-clipboard');

interface FakeBridge {
  readonly bridge: DesktopClipboard;
  readonly written: string[];
  readonly listeners: Set<(text: string) => void>;
}

function fakeBridge(text: string | null): FakeBridge {
  const written: string[] = [];
  const listeners = new Set<(text: string) => void>();
  return {
    written,
    listeners,
    bridge: {
      readText: (): Promise<string | null> => Promise.resolve(text),
      writeText: (value: string): Promise<void> => {
        written.push(value);
        return Promise.resolve();
      },
      onChange: (listener: (text: string) => void) => {
        listeners.add(listener);
        return (): void => {
          listeners.delete(listener);
        };
      },
    },
  };
}

describe('the clipboard this app reads and writes', () => {
  beforeEach(() => {
    expo.error = null;
    expo.written = [];
    expo.listeners.clear();
    native = false;
  });

  it('uses the desktop bridge when the app runs on the computer', async () => {
    const fake = fakeBridge('from the system clipboard');
    const clipboard = localClipboard(fake.bridge);
    expect(await clipboard.read()).toBe('from the system clipboard');
    await clipboard.write('from the phone');
    expect(fake.written).toStrictEqual(['from the phone']);
    expect(expo.written).toStrictEqual([]);
  });

  it('watches the desktop bridge for copies made anywhere on the computer', () => {
    const fake = fakeBridge(null);
    const clipboard = localClipboard(fake.bridge);
    const seen: number[] = [];
    const stop = clipboard.watch(() => seen.push(1));
    expect(fake.listeners.size).toBe(1);
    for (const listener of fake.listeners) listener('desk copy');
    expect(seen).toStrictEqual([1]);
    stop();
    expect(fake.listeners.size).toBe(0);
  });

  it('reads and writes through expo in a browser', async () => {
    const clipboard = localClipboard(null);
    expect(await clipboard.read()).toBe('copied in the app');
    await clipboard.write('from the phone');
    expect(expo.written).toStrictEqual(['from the phone']);
  });

  it('treats a browser that refuses the clipboard as having nothing to read', async () => {
    expo.error = Object.assign(new Error('User denied permission to access clipboard'), {
      code: 'ERR_NO_PERMISSION',
    });
    const clipboard = localClipboard(null);
    expect(await clipboard.read()).toBeNull();
  });

  it('reports any other clipboard failure', async () => {
    expo.error = new Error('the clipboard is broken');
    const clipboard = localClipboard(null);
    await expect(clipboard.read()).rejects.toThrow('the clipboard is broken');
  });

  it('watches the phone clipboard on a phone and stops when asked', () => {
    native = true;
    const clipboard = localClipboard(null);
    const stop = clipboard.watch(() => undefined);
    expect(expo.listeners.size).toBe(1);
    stop();
    expect(expo.listeners.size).toBe(0);
  });

  it('has nothing to watch in a browser, where a copy is seen when the page is focused', () => {
    const clipboard = localClipboard(null);
    const stop = clipboard.watch(() => undefined);
    expect(expo.listeners.size).toBe(0);
    expect(() => {
      stop();
    }).not.toThrow();
  });
});
