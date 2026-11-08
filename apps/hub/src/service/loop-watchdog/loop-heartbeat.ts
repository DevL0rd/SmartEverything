import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { cpuUsage, getActiveResourcesInfo, memoryUsage } from 'node:process';
import { getHeapStatistics } from 'node:v8';
import type { Logger } from '@smarteverything/logging';
import { BEAT_SEQUENCE, HEALTH_EVERY_TICKS, LAG_WARN_MS } from './settings';

const NS_PER_MS = 1_000_000;
const BYTES_PER_MB = 1_048_576;
const DELAY_RESOLUTION_MS = 10;

const megabytes = (bytes: number): number => Math.round(bytes / BYTES_PER_MB);

function activeResources(): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const name of getActiveResourcesInfo()) {
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

export class LoopHeartbeat {
  private readonly delay = monitorEventLoopDelay({ resolution: DELAY_RESOLUTION_MS });
  private timer: NodeJS.Timeout | null = null;
  private expectedAt = 0;
  private ticks = 0;
  private windowMaxMs = 0;
  private cpu = cpuUsage();
  private utilisation = performance.eventLoopUtilization();

  constructor(
    private readonly beat: Int32Array,
    private readonly tickMs: number,
    private readonly name: string,
    private readonly log: Logger,
  ) {}

  start(): void {
    this.delay.enable();
    this.expectedAt = performance.now() + this.tickMs;
    this.timer = setInterval(() => {
      this.tick();
    }, this.tickMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.delay.disable();
  }

  private tick(): void {
    Atomics.add(this.beat, BEAT_SEQUENCE, 1);
    const now = performance.now();
    const lateMs = Math.max(0, now - this.expectedAt);
    this.expectedAt = now + this.tickMs;
    const blockedMs = this.delay.max / NS_PER_MS;
    this.delay.reset();
    this.windowMaxMs = Math.max(this.windowMaxMs, lateMs, blockedMs);
    const busy = this.busy();
    if (Math.max(lateMs, blockedMs) >= LAG_WARN_MS) {
      this.log.warn('loop.lagged', {
        name: this.name,
        lateMs: Math.round(lateMs),
        blockedMs: Math.round(blockedMs),
        ...busy,
      });
    }
    this.ticks += 1;
    if (this.ticks % HEALTH_EVERY_TICKS === 0) {
      this.health(busy);
    }
  }

  private busy(): Readonly<Record<string, unknown>> {
    const cpu = cpuUsage(this.cpu);
    this.cpu = cpuUsage();
    const utilisation = performance.eventLoopUtilization(this.utilisation);
    this.utilisation = performance.eventLoopUtilization();
    return {
      cpuUserMs: Math.round(cpu.user / 1000),
      cpuSystemMs: Math.round(cpu.system / 1000),
      utilisation: Math.round(utilisation.utilization * 100) / 100,
      resources: activeResources(),
    };
  }

  private health(busy: Readonly<Record<string, unknown>>): void {
    const memory = memoryUsage();
    const heap = getHeapStatistics();
    this.log.info('loop.health', {
      name: this.name,
      rssMb: megabytes(memory.rss),
      heapUsedMb: megabytes(heap.used_heap_size),
      heapLimitMb: megabytes(heap.heap_size_limit),
      externalMb: megabytes(memory.external),
      arrayBuffersMb: megabytes(memory.arrayBuffers),
      worstLagMs: Math.round(this.windowMaxMs),
      ...busy,
    });
    this.windowMaxMs = 0;
  }
}
