const setIntervalOriginal = globalThis.setInterval;
const clearIntervalOriginal = globalThis.clearInterval;
const requestFrameOriginal: unknown = Reflect.get(globalThis, 'requestAnimationFrame');
const cancelFrameOriginal: unknown = Reflect.get(globalThis, 'cancelAnimationFrame');

function frameFunction(original: unknown, name: string): (...args: unknown[]) => unknown {
  return (...args) => {
    if (typeof original !== 'function') {
      throw new Error(`${name} is not available in this runtime`);
    }
    const handle: unknown = Reflect.apply(original, globalThis, args);
    return handle;
  };
}

const requestFrame = frameFunction(requestFrameOriginal, 'requestAnimationFrame');
const cancelFrame = frameFunction(cancelFrameOriginal, 'cancelAnimationFrame');

let frameRequests = 0;

export function takeFrameRequests(): number {
  const taken = frameRequests;
  frameRequests = 0;
  return taken;
}

export const rawTimers = {
  setInterval: (run: () => void, ms: number): ReturnType<typeof setInterval> =>
    setIntervalOriginal(run, ms),
  clearInterval: (handle: ReturnType<typeof setInterval>): void => {
    clearIntervalOriginal(handle);
  },
  requestAnimationFrame: (run: (now: number) => void): number => {
    frameRequests += 1;
    return Number(requestFrame(run));
  },
  cancelAnimationFrame: (handle: number): void => {
    cancelFrame(handle);
  },
} as const;
