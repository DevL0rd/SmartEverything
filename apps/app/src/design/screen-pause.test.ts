import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenPause } from './screen-pause';

let frames: (() => void)[] = [];

function nextFrame(): void {
  const due = frames;
  frames = [];
  for (const frame of due) frame();
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function layer(parent: ScreenPause | null, own = false): ScreenPause {
  const pause = new ScreenPause(parent);
  pause.attach();
  pause.setOwn(own);
  return pause;
}

describe('a screen pause', () => {
  it('holds wakes while paused and runs each once on resume', () => {
    const pause = layer(null, true);
    let woken = 0;
    const wake = pause.gate(() => {
      woken += 1;
    });
    wake();
    wake();
    expect(woken).toBe(0);
    pause.setOwn(false);
    expect(pause.isPaused()).toBe(false);
    expect(woken).toBe(0);
    nextFrame();
    expect(woken).toBe(1);
    wake();
    expect(woken).toBe(2);
  });

  it('keeps held wakes when it pauses again before the next frame', () => {
    const pause = layer(null, true);
    let woken = 0;
    pause.gate(() => {
      woken += 1;
    })();
    pause.setOwn(false);
    pause.setOwn(true);
    nextFrame();
    expect(woken).toBe(0);
    pause.setOwn(false);
    nextFrame();
    expect(woken).toBe(1);
  });

  it('resumes every screen shown in one frame with a single frame request', () => {
    const tab = layer(null, true);
    const screen = layer(tab);
    let woken = 0;
    tab.gate(() => {
      woken += 1;
    })();
    screen.gate(() => {
      woken += 1;
    })();
    tab.setOwn(false);
    expect(frames).toHaveLength(1);
    nextFrame();
    expect(woken).toBe(2);
  });

  it('drops a held wake whose subscriber left', () => {
    const pause = layer(null, true);
    let woken = 0;
    const listener = (): void => {
      woken += 1;
    };
    pause.gate(listener)();
    pause.release(listener);
    pause.setOwn(false);
    nextFrame();
    expect(woken).toBe(0);
  });

  it('pauses and resumes nested screens with their parent', () => {
    const tab = layer(null);
    const screen = layer(tab);
    let woken = 0;
    const wake = screen.gate(() => {
      woken += 1;
    });
    tab.setOwn(true);
    expect(screen.isPaused()).toBe(true);
    wake();
    expect(woken).toBe(0);
    tab.setOwn(false);
    expect(screen.isPaused()).toBe(false);
    nextFrame();
    expect(woken).toBe(1);
  });

  it('notifies listeners only when the effective state changes', () => {
    const tab = layer(null);
    const screen = layer(tab, true);
    let changes = 0;
    screen.subscribe(() => {
      changes += 1;
    });
    tab.setOwn(true);
    tab.setOwn(false);
    nextFrame();
    expect(changes).toBe(0);
    screen.setOwn(false);
    expect(changes).toBe(0);
    nextFrame();
    expect(changes).toBe(1);
  });

  it('starts paused when created paused and holds wakes from the first render', () => {
    const pause = new ScreenPause(null, true);
    expect(pause.isPaused()).toBe(true);
    let woken = 0;
    pause.gate(() => {
      woken += 1;
    })();
    expect(woken).toBe(0);
    pause.setOwn(false);
    nextFrame();
    expect(woken).toBe(1);
  });
});
