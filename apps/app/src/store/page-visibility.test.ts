import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followPageVisibility, HIDDEN_REFRESH_MS } from './page-visibility';

class FakeDocument extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';

  show(): void {
    this.visibilityState = 'visible';
    this.dispatchEvent(new Event('visibilitychange'));
  }

  hide(): void {
    this.visibilityState = 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

describe('followPageVisibility', () => {
  let page = new FakeDocument();
  const sync = { refresh: vi.fn(), online: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    page = new FakeDocument();
    vi.stubGlobal('document', page);
    sync.refresh.mockReset();
    sync.online.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not refetch everything when the tab only lost focus for a moment', () => {
    followPageVisibility(sync);
    page.hide();
    vi.advanceTimersByTime(30_000);
    page.show();
    expect(sync.refresh).not.toHaveBeenCalled();
    expect(sync.online).toHaveBeenCalledTimes(1);
  });

  it('refreshes once after the tab was hidden for a long time', () => {
    followPageVisibility(sync);
    page.hide();
    vi.advanceTimersByTime(HIDDEN_REFRESH_MS);
    page.show();
    expect(sync.refresh).toHaveBeenCalledTimes(1);
  });

  it('stops listening when released', () => {
    const stop = followPageVisibility(sync);
    stop();
    page.hide();
    vi.advanceTimersByTime(HIDDEN_REFRESH_MS);
    page.show();
    expect(sync.refresh).not.toHaveBeenCalled();
  });
});
