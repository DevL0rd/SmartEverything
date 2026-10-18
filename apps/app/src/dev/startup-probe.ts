import { z } from 'zod';
import { processAgeMs } from './native-probe';
import { logEvent } from './window-bus';
import { round1 } from './window-math';

const TOP_REQUIRES = 12;

const REQUIRE_TIMES = z.object({
  slow: z.array(z.tuple([z.string(), z.number()])),
  count: z.number(),
  totalMs: z.number(),
  firstAt: z.number(),
  lastAt: z.number(),
});

const STARTUP_MARKS = [
  'startTime',
  'initializeRuntimeStart',
  'initializeRuntimeEnd',
  'executeJavaScriptBundleEntryPointStart',
  'executeJavaScriptBundleEntryPointEnd',
  'endTime',
] as const;

const marks = { firstCommit: 0, firstRoute: 0 };
let logged = false;

export function markFirstCommit(): void {
  if (marks.firstCommit === 0) {
    marks.firstCommit = performance.now();
  }
}

export function markFirstRoute(): void {
  if (marks.firstRoute === 0) {
    marks.firstRoute = performance.now();
  }
}

function startupTiming(): Record<string, number> {
  const timing: unknown = Reflect.get(performance, 'rnStartupTiming');
  const fields: Record<string, number> = {};
  if (typeof timing !== 'object' || timing === null) {
    return fields;
  }
  const origin: unknown = Reflect.get(timing, 'startTime');
  STARTUP_MARKS.forEach((mark) => {
    const value: unknown = Reflect.get(timing, mark);
    if (typeof value === 'number' && typeof origin === 'number') {
      fields[`rn.${mark}`] = Math.round(value - origin);
    }
  });
  return fields;
}

export function topRequires(slow: readonly (readonly [string, number])[], limit: number): string {
  return [...slow]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, ms]) => `${name.replace(/^.*node_modules\//, '~').slice(-40)}:${String(ms)}`)
    .join(',');
}

function requireFields(): Record<string, number | string> {
  const parsed = REQUIRE_TIMES.safeParse(Reflect.get(globalThis, '__SE_REQUIRE_TIMES__'));
  if (!parsed.success) {
    return { requires: 'not-recorded' };
  }
  const times = parsed.data;
  return {
    requires: times.count,
    requireMs: Math.round(times.totalMs),
    requireSpanMs: Math.round(times.lastAt - times.firstAt),
    requireTop: topRequires(times.slow, TOP_REQUIRES),
  };
}

export function logStartup(): void {
  if (logged) {
    return;
  }
  logged = true;
  const now = performance.now();
  const age = processAgeMs();
  const bundleStart: unknown = Reflect.get(globalThis, '__BUNDLE_START_TIME__');
  logEvent('perf.startup', {
    ...startupTiming(),
    bundleStartMs: typeof bundleStart === 'number' ? Math.round(bundleStart) : 'unknown',
    firstCommitMs: Math.round(marks.firstCommit),
    firstRouteMs: Math.round(marks.firstRoute),
    readyMs: Math.round(now),
    processAgeAtReadyMs: age === null ? 'needs-new-build' : Math.round(age),
    nativeBeforeJsMs: age === null ? 'needs-new-build' : round1(age - now),
    ...requireFields(),
  });
}
