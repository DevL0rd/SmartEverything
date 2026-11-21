import { mkdir, rename, writeFile } from 'node:fs/promises';
import { Session } from 'node:inspector';
import { join } from 'node:path';
import { env } from 'node:process';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { background } from '@smarteverything/logging';
import { z } from 'zod';
import type { MountMetrics } from './metrics';

const VARIABLE = 'SMARTEVERYTHING_MOUNT_BENCH';
const SAMPLING_US = 1000;
const PROFILE = z.object({ profile: z.unknown() });

function post(session: Session, method: string, params?: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    session.post(method, params, (failure, result) => {
      if (failure === null) resolve(result);
      else reject(failure);
    });
  });
}

export class BenchProbe {
  private segment = 0;
  private cpu = process.cpuUsage();
  private elu = performance.eventLoopUtilization();
  private readonly delay = monitorEventLoopDelay({ resolution: 1 });
  private readonly inspector = new Session();

  private constructor(
    private readonly dir: string,
    private readonly metrics: MountMetrics,
  ) {
    this.inspector.connect();
    this.delay.enable();
    process.on('SIGUSR2', () => {
      background(this.dump(), 'drive_mount.bench_dump_failed');
    });
    background(this.startProfiler(), 'drive_mount.bench_profiler_failed');
  }

  static startFromEnvironment(metrics: MountMetrics): void {
    const dir = env[VARIABLE];
    if (dir !== undefined && dir !== '') new BenchProbe(dir, metrics);
  }

  private async startProfiler(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await post(this.inspector, 'Profiler.enable');
    await post(this.inspector, 'Profiler.setSamplingInterval', { interval: SAMPLING_US });
    await post(this.inspector, 'Profiler.start');
  }

  private async publish(name: string, content: string): Promise<void> {
    const staged = join(this.dir, `${name}.tmp`);
    await writeFile(staged, content);
    await rename(staged, join(this.dir, name));
  }

  private async dump(): Promise<void> {
    this.segment += 1;
    const segment = String(this.segment);
    const { profile } = PROFILE.parse(await post(this.inspector, 'Profiler.stop'));
    await post(this.inspector, 'Profiler.start');
    const cpu = process.cpuUsage(this.cpu);
    const report = {
      segment: this.segment,
      ops: this.metrics.snapshot(),
      cpuUserMs: cpu.user / 1000,
      cpuSystemMs: cpu.system / 1000,
      eventLoopUtilization: performance.eventLoopUtilization(this.elu).utilization,
      eventLoopDelayMs: {
        p50: this.delay.percentile(50) / 1e6,
        p99: this.delay.percentile(99) / 1e6,
        max: this.delay.max / 1e6,
      },
    };
    this.metrics.reset();
    this.cpu = process.cpuUsage();
    this.elu = performance.eventLoopUtilization();
    this.delay.reset();
    await this.publish(`hub-${segment}.cpuprofile`, JSON.stringify(profile));
    await this.publish(`hub-${segment}.json`, JSON.stringify(report));
  }
}
