import { describe, expect, it, vi } from 'vitest';
import { followBackground, type BackgroundFollowPorts } from './background-follow';

function rig(
  initial: string,
  allowed: boolean | Promise<boolean> = true,
): {
  readonly link: {
    readonly start: ReturnType<typeof vi.fn>;
    readonly stop: ReturnType<typeof vi.fn>;
  };
  readonly move: (state: string) => void;
  readonly stopFollowing: () => void;
  readonly listeners: Set<(state: string) => void>;
} {
  let state = initial;
  const listeners = new Set<(state: string) => void>();
  const ports: BackgroundFollowPorts = {
    current: () => state,
    onChange: (listener) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    alertsAllowed: () => Promise.resolve(allowed),
  };
  const link = { start: vi.fn(), stop: vi.fn() };
  const stopFollowing = followBackground(link, ports);
  return {
    link,
    stopFollowing,
    listeners,
    move: (next): void => {
      state = next;
      listeners.forEach((listener) => {
        listener(next);
      });
    },
  };
}

const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('following whether the app is in the background', () => {
  it('starts the link when the app goes to the background and stops it when the app comes back', async () => {
    const { link, move } = rig('active');
    move('background');
    await settled();
    expect(link.start).toHaveBeenCalledTimes(1);
    move('active');
    expect(link.stop).toHaveBeenCalled();
  });

  it('starts at once when the app is already in the background', async () => {
    const { link } = rig('background');
    await settled();
    expect(link.start).toHaveBeenCalledTimes(1);
  });

  it('keeps the link closed while alerts are off on this phone', async () => {
    const { link, move } = rig('active', false);
    move('background');
    await settled();
    expect(link.start).not.toHaveBeenCalled();
  });

  it('does not start when the app came back to the front while the permission was being read', async () => {
    const { link, move } = rig('active');
    move('background');
    move('active');
    await settled();
    expect(link.start).not.toHaveBeenCalled();
  });

  it('stops the link and stops listening once it is no longer followed', async () => {
    const { link, move, stopFollowing, listeners } = rig('active');
    move('background');
    stopFollowing();
    await settled();
    expect(link.start).not.toHaveBeenCalled();
    expect(link.stop).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
