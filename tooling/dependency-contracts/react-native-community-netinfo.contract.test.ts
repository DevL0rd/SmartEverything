import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { installedVersion } from './versions';
import { appDeclaredVersion } from './app-manifest';
import { readRepositoryJson } from './contract-helpers';

const PACKAGE = '@react-native-community/netinfo';
const CHANGED = 'netInfo.networkStatusDidChange';

interface NativeState {
  readonly type: string;
  readonly isConnected: boolean;
  readonly isInternetReachable: boolean | null;
  readonly details: null;
}

const phone = vi.hoisted(() => ({
  now: { type: 'none', isConnected: false, isInternetReachable: null, details: null },
  listeners: new Map<string, (state: unknown) => void>(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    RNCNetInfo: {
      configure: (): void => undefined,
      addListener: (): void => undefined,
      removeListeners: (): void => undefined,
      getCurrentState: (): Promise<NativeState> => Promise.resolve(phone.now),
    },
  },
  NativeEventEmitter: class {
    addListener(event: string, listener: (state: unknown) => void): { remove: () => void } {
      phone.listeners.set(event, listener);
      return {
        remove: (): void => {
          phone.listeners.delete(event);
        },
      };
    }
  },
}));

const { default: NetInfo } = await import('@react-native-community/netinfo');

const BUNDLED = z.record(z.string(), z.string());

describe('@react-native-community/netinfo contract', () => {
  it('is installed at exactly the version the app declares', () => {
    expect(installedVersion(PACKAGE)).toBe(appDeclaredVersion(PACKAGE));
  });

  it('is the build Expo SDK 57 bundles, so it links against the native runtime the app uses', () => {
    const bundled = readRepositoryJson('node_modules/expo/bundledNativeModules.json', BUNDLED);
    expect(bundled[PACKAGE]).toBe(installedVersion(PACKAGE));
  });

  it('offers configure and addEventListener on its default export', () => {
    expect([typeof NetInfo.configure, typeof NetInfo.addEventListener]).toStrictEqual([
      'function',
      'function',
    ]);
  });

  it('hands a listener the current state, then each change, with isConnected on it', async () => {
    NetInfo.configure({ reachabilityShouldRun: () => false });
    const heard: (boolean | null)[] = [];
    const stop = NetInfo.addEventListener((state) => {
      heard.push(state.isConnected);
    });
    await vi.waitFor(() => {
      expect(heard.length).toBeGreaterThan(0);
    });
    expect(new Set(heard)).toStrictEqual(new Set([false]));
    phone.listeners.get(CHANGED)?.({
      type: 'wifi',
      isConnected: true,
      isInternetReachable: null,
      details: null,
    });
    expect(heard.at(-1)).toBe(true);
    stop();
  });

  it('stops calling a listener once it is unsubscribed', async () => {
    const heard: (boolean | null)[] = [];
    const stop = NetInfo.addEventListener((state) => {
      heard.push(state.isConnected);
    });
    await vi.waitFor(() => {
      expect(heard.length).toBeGreaterThan(0);
    });
    stop();
    const before = heard.length;
    phone.listeners.get(CHANGED)?.({
      type: 'none',
      isConnected: false,
      isInternetReachable: null,
      details: null,
    });
    expect(heard.length).toBe(before);
  });
});
