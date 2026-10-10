export interface CameraSurface {
  readonly capture: () => Promise<string>;
}

class CameraSurfaceTimeoutError extends Error {
  override readonly name = 'CameraSurfaceTimeoutError';

  constructor(readonly waitedMs: number) {
    super(`The camera preview did not open within ${String(waitedMs)} ms`);
  }
}

interface Waiter {
  readonly resolve: (surface: CameraSurface) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

class CameraSurfaces {
  private surface: CameraSurface | null = null;
  private readonly waiters = new Set<Waiter>();

  get current(): CameraSurface | null {
    return this.surface;
  }

  attach(surface: CameraSurface): void {
    this.surface = surface;
    this.waiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.resolve(surface);
    });
    this.waiters.clear();
  }

  detach(surface: CameraSurface): void {
    if (this.surface === surface) {
      this.surface = null;
    }
  }

  ready(timeoutMs: number): Promise<CameraSurface> {
    if (this.surface !== null) {
      return Promise.resolve(this.surface);
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new CameraSurfaceTimeoutError(timeoutMs));
        }, timeoutMs),
      };
      this.waiters.add(waiter);
    });
  }
}

export const cameraSurfaces = new CameraSurfaces();

const WANTED_LONG_EDGE = 1280;

export function pictureSizeOf(sizes: readonly string[]): string | null {
  const candidates = sizes
    .map((size) => {
      const [width, height] = size.split('x').map(Number);
      return { size, longEdge: Math.max(width ?? 0, height ?? 0) };
    })
    .filter((candidate) => candidate.longEdge > 0)
    .sort((left, right) => left.longEdge - right.longEdge);
  const enough = candidates.find((candidate) => candidate.longEdge >= WANTED_LONG_EDGE);
  return (enough ?? candidates.at(-1))?.size ?? null;
}
