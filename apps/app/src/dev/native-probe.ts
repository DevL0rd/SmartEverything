import { requireOptionalNativeModule } from 'expo';
import { z } from 'zod';
import { acquireFrameStats } from './native-frames';
import { addContributor, currentScreen, logEvent } from './window-bus';
import { percent, round1, type WindowFields } from './window-math';

const NUMBERS = z.record(z.string(), z.number());

const NATIVE_SNAPSHOT = z.object({
  memory: NUMBERS,
  power: NUMBERS,
  threads: NUMBERS,
  processTicks: z.number(),
  ticksPerSecond: z.number(),
  uptimeMs: z.number(),
  frames: z.object({
    frames: z.number(),
    janky: z.number(),
    slow: z.number(),
    frozen: z.number(),
    worstMs: z.number(),
    totalMs: z.number(),
  }),
});

export type NativeSnapshot = z.infer<typeof NATIVE_SNAPSHOT>;

const PROCESS_TIMES = z.object({ startUptimeMs: z.number(), nowUptimeMs: z.number() });

interface DiagnosticsPerf {
  perfSnapshot?: () => Promise<unknown>;
  processTimes?: () => unknown;
}

const MEGABYTE_KB = 1024;
const TOP_THREADS = 6;
const THREADS: Readonly<Record<string, RegExp>> = {
  jsCpu: /mqt_(v_)?js/,
  nativeCpu: /mqt_(v_)?native/,
  renderCpu: /^RenderThread$/,
  gcCpu: /HeapTaskDaemon/,
};

const diagnostics = requireOptionalNativeModule<DiagnosticsPerf>('Diagnostics');

export function processAgeMs(): number | null {
  const read = diagnostics?.processTimes;
  if (read === undefined) {
    return null;
  }
  const times = PROCESS_TIMES.parse(read());
  return times.nowUptimeMs - times.startUptimeMs;
}

function cpuPercent(ticks: number, snapshot: NativeSnapshot, elapsedMs: number): number {
  return elapsedMs > 0 ? round1((ticks / snapshot.ticksPerSecond / (elapsedMs / 1000)) * 100) : 0;
}

function threadDelta(now: NativeSnapshot, before: NativeSnapshot): [string, number][] {
  return Object.entries(now.threads).map(([name, ticks]) => [
    name,
    Math.max(0, ticks - (before.threads[name] ?? ticks)),
  ]);
}

export function nativeFields(now: NativeSnapshot, before: NativeSnapshot): WindowFields {
  const elapsed = now.uptimeMs - before.uptimeMs;
  const memory = (key: string): number => round1((now.memory[key] ?? 0) / MEGABYTE_KB);
  const fields: WindowFields = {
    rssMb: memory('rssKb'),
    pssMb: memory('pssKb'),
    javaMb: memory('javaHeapKb'),
    nativeMb: memory('nativeHeapKb'),
    gfxMb: memory('graphicsKb'),
    cpuPct: cpuPercent(now.processTicks - before.processTicks, now, elapsed),
    nFrames: now.frames.frames,
    nJankPct: percent(now.frames.janky, now.frames.frames),
    nSlow: now.frames.slow,
    nFrozen: now.frames.frozen,
    nWorstMs: Math.round(now.frames.worstMs),
    thermal: now.power['thermal'] ?? -1,
    battMa: Math.round((now.power['batteryUa'] ?? 0) / 1000),
    battTempC: now.power['batteryTempC'] ?? 0,
  };
  const deltas = threadDelta(now, before);
  Object.entries(THREADS).forEach(([field, pattern]) => {
    const ticks = deltas.filter(([name]) => pattern.test(name)).reduce((sum, [, t]) => sum + t, 0);
    fields[field] = cpuPercent(ticks, now, elapsed);
  });
  return fields;
}

export function topThreads(now: NativeSnapshot, before: NativeSnapshot): string {
  const elapsed = now.uptimeMs - before.uptimeMs;
  return threadDelta(now, before)
    .sort(([, a], [, b]) => b - a)
    .slice(0, TOP_THREADS)
    .filter(([, ticks]) => ticks > 0)
    .map(([name, ticks]) => `${name.slice(0, 16)}:${String(cpuPercent(ticks, now, elapsed))}`)
    .join(',');
}

export function startNativeProbe(): () => void {
  const read = diagnostics?.perfSnapshot;
  if (read === undefined) {
    logEvent('perf.native_missing', {
      reason: 'this app build has no native performance snapshot',
    });
    return addContributor('native', { fields: () => ({ native: 'needs-new-build' }) });
  }
  const releaseFrameStats = acquireFrameStats();
  let before: NativeSnapshot | null = null;
  const sample = (screen: string): void => {
    read()
      .then((raw) => {
        const now = NATIVE_SNAPSHOT.parse(raw);
        if (before !== null) {
          logEvent('perf.native', {
            ...nativeFields(now, before),
            threads: topThreads(now, before),
            screen,
          });
        }
        before = now;
      })
      .catch((error: unknown) => {
        logEvent('perf.native_failed', { reason: String(error) });
      });
  };
  sample(currentScreen());
  const remove = addContributor('native', {
    fields: () => {
      sample(currentScreen());
      return {};
    },
  });
  return (): void => {
    remove();
    releaseFrameStats();
  };
}
