import { describe, expect, it, vi } from 'vitest';
import {
  HoldChannel,
  LOCK_BOTTOM,
  LOCK_HEIGHT,
  LOCK_REACH,
  MIC_FRAME,
  holdGeometry,
  holdReleaseOf,
  holdZoneOf,
} from './recorder-hold';

describe('hold to record zones', () => {
  const geometry = holdGeometry(256);

  it('cancels once the finger passes the middle of the strip', () => {
    expect(geometry.cancelAt).toBe(150);
    expect(holdZoneOf(-149, 0, geometry)).toBe('hold');
    expect(holdZoneOf(-150, 0, geometry)).toBe('cancel');
  });

  it('locks when the finger reaches the lock badge above the mic', () => {
    expect(LOCK_REACH).toBe(LOCK_BOTTOM + LOCK_HEIGHT / 2 - MIC_FRAME / 2);
    expect(holdZoneOf(0, -(LOCK_REACH - 1), geometry)).toBe('hold');
    expect(holdZoneOf(-10, -LOCK_REACH, geometry)).toBe('lock');
  });

  it('prefers the direction the finger travelled further', () => {
    expect(holdZoneOf(-200, -LOCK_REACH, geometry)).toBe('cancel');
    expect(holdZoneOf(-LOCK_REACH, -(LOCK_REACH + 40), geometry)).toBe('lock');
  });

  it('keeps a usable cancel line when the mic sits at the very start of the row', () => {
    expect(holdGeometry(0).cancelAt).toBe(MIC_FRAME / 2);
  });

  it('sends on release only while recording in the hold zone', () => {
    expect(holdReleaseOf('hold', true)).toBe('send');
    expect(holdReleaseOf('hold', false)).toBe('keep');
    expect(holdReleaseOf('cancel', true)).toBe('cancel');
    expect(holdReleaseOf('cancel', false)).toBe('cancel');
    expect(holdReleaseOf('lock', true)).toBe('keep');
  });
});

describe('hold channel', () => {
  function attached(): {
    readonly channel: HoldChannel;
    readonly handle: {
      move: ReturnType<typeof vi.fn>;
      release: ReturnType<typeof vi.fn>;
      interrupt: ReturnType<typeof vi.fn>;
    };
    readonly detach: () => void;
  } {
    const channel = new HoldChannel();
    const handle = { move: vi.fn(), release: vi.fn(), interrupt: vi.fn() };
    return { channel, handle, detach: channel.attach(handle) };
  }

  it('reports only zone changes and releases in the last zone', () => {
    const { channel, handle } = attached();
    channel.begin();
    channel.track('hold');
    channel.track('cancel');
    channel.track('cancel');
    channel.track('hold');
    expect(handle.move.mock.calls).toEqual([['cancel'], ['hold']]);
    channel.track('cancel');
    expect(channel.end(true)).toBe(true);
    expect(handle.release).toHaveBeenCalledWith('cancel');
  });

  it('starts every hold in the hold zone', () => {
    const { channel, handle } = attached();
    channel.track('cancel');
    channel.begin();
    channel.end(true);
    expect(handle.release).toHaveBeenCalledWith('hold');
  });

  it('hands an interrupted gesture to the session instead of releasing it', () => {
    const { channel, handle } = attached();
    channel.end(false);
    expect(handle.interrupt).toHaveBeenCalledOnce();
    expect(handle.release).not.toHaveBeenCalled();
  });

  it('tells the gesture when no session is listening so it can close', () => {
    const { channel, handle, detach } = attached();
    detach();
    expect(channel.end(true)).toBe(false);
    channel.track('cancel');
    expect(handle.move).not.toHaveBeenCalled();
  });

  it('keeps a newer session attached when an older one detaches late', () => {
    const { channel, detach } = attached();
    const newer = { move: vi.fn(), release: vi.fn(), interrupt: vi.fn() };
    channel.attach(newer);
    detach();
    expect(channel.end(true)).toBe(true);
    expect(newer.release).toHaveBeenCalledWith('hold');
  });
});
