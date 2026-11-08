import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ value: true }));

vi.mock('../../../design/platform', () => ({ isNative: (): boolean => native.value }));

import { onWindowFocus } from './window-focus';

describe('onWindowFocus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not touch window on a native runtime where window has no addEventListener', () => {
    native.value = true;
    vi.stubGlobal('window', {});
    const stop = onWindowFocus(() => undefined);
    expect(() => {
      stop();
    }).not.toThrow();
  });

  it('listens for focus on the web and stops on cleanup', () => {
    native.value = false;
    const add = vi.fn();
    const remove = vi.fn();
    vi.stubGlobal('window', { addEventListener: add, removeEventListener: remove });
    const listener = (): void => undefined;
    const stop = onWindowFocus(listener);
    expect(add).toHaveBeenCalledWith('focus', listener);
    stop();
    expect(remove).toHaveBeenCalledWith('focus', listener);
  });
});
