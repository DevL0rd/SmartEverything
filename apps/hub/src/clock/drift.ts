export interface DriftWatchOptions {
  readonly intervalMs: number;
  readonly toleranceMs: number;
  readonly now: () => number;
  readonly onResume: () => void;
}

export function watchClockDrift(options: DriftWatchOptions): () => void {
  let last = options.now();
  const timer = setInterval(() => {
    const current = options.now();
    const drifted = current - last > options.intervalMs + options.toleranceMs;
    last = current;
    if (drifted) {
      options.onResume();
    }
  }, options.intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
