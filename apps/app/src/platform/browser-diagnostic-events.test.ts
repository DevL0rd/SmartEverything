import { describe, expect, it, vi } from 'vitest';

import {
  nativeBrowserDiagnostic,
  subscribeNativeBrowserDiagnostic,
} from '../../modules/health-connect/src/browser-diagnostics-events';

describe('native browser diagnostic events', () => {
  it('ignores an invalid event without throwing into the native dispatcher', () => {
    const listener = vi.fn();
    const stop = subscribeNativeBrowserDiagnostic(listener);
    expect(() => {
      nativeBrowserDiagnostic({ kind: 'nonsense' });
    }).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it('delivers a valid event to subscribers', () => {
    const listener = vi.fn();
    const stop = subscribeNativeBrowserDiagnostic(listener);
    nativeBrowserDiagnostic({ kind: 'epoch', id: 'tab-1', epoch: 'e1' });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });
});
