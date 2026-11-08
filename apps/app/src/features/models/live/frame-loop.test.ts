import { describe, expect, it } from 'vitest';
import { createFrameLoop, type FrameScheduler } from './frame-loop';

interface FakeScheduler {
  readonly scheduler: FrameScheduler;
  readonly tick: () => number;
  readonly size: () => number;
}

function fakeScheduler(): FakeScheduler {
  const queue = new Map<number, (nowMs: number) => void>();
  let next = 1;
  let now = 0;
  const scheduler: FrameScheduler = {
    request: (callback) => {
      const handle = next;
      next += 1;
      queue.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      queue.delete(handle);
    },
    now: () => now,
  };
  const tick = (): number => {
    now += 16;
    const due = [...queue.values()];
    queue.clear();
    for (const callback of due) callback(now);
    return due.length;
  };
  return { scheduler, tick, size: (): number => queue.size };
}

describe('live frame loop', () => {
  it('runs only while the live set is not empty', () => {
    const fake = fakeScheduler();
    let frames = 0;
    const loop = createFrameLoop({
      scheduler: fake.scheduler,
      step: () => {
        frames += 1;
        return true;
      },
      onFrameTime: () => false,
    });
    loop.invalidate();
    expect(fake.size()).toBe(0);
    loop.setActive(true);
    fake.tick();
    fake.tick();
    expect(frames).toBe(2);
    loop.setActive(false);
    expect(fake.tick()).toBe(0);
    expect(frames).toBe(2);
  });

  it('draws on demand when nothing moves and continuously while something moves', () => {
    const fake = fakeScheduler();
    let moving = false;
    let frames = 0;
    const loop = createFrameLoop({
      scheduler: fake.scheduler,
      step: () => {
        frames += 1;
        return moving;
      },
      onFrameTime: () => false,
    });
    loop.setActive(true);
    fake.tick();
    expect(loop.pending()).toBe(false);
    loop.invalidate();
    loop.invalidate();
    fake.tick();
    expect(frames).toBe(2);
    moving = true;
    loop.invalidate();
    fake.tick();
    fake.tick();
    expect(frames).toBe(4);
    expect(loop.pending()).toBe(true);
    loop.dispose();
    expect(fake.tick()).toBe(0);
  });

  it('reports the measured frame time to the quality scaler', () => {
    const fake = fakeScheduler();
    const times: number[] = [];
    const loop = createFrameLoop({
      scheduler: fake.scheduler,
      step: () => false,
      onFrameTime: (ms) => {
        times.push(ms);
        return false;
      },
    });
    loop.setActive(true);
    fake.tick();
    expect(times).toEqual([0]);
  });

  it('wakes an idle loop for one more frame when the frame time changes the quality', () => {
    const fake = fakeScheduler();
    let frames = 0;
    let stepped = false;
    const loop = createFrameLoop({
      scheduler: fake.scheduler,
      step: () => {
        frames += 1;
        return false;
      },
      onFrameTime: () => stepped,
    });
    loop.setActive(true);
    fake.tick();
    expect(loop.pending()).toBe(false);
    stepped = true;
    loop.invalidate();
    fake.tick();
    expect(loop.pending()).toBe(true);
    stepped = false;
    fake.tick();
    expect(frames).toBe(3);
    expect(loop.pending()).toBe(false);
  });
});
