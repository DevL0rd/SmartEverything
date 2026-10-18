import type {
  ComputerFeature,
  GpuSnapshot,
  HistoryPolicy,
  NodeHello,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { readdirSync } from 'node:fs';
import { cpus } from 'node:os';
import type { CollectorReaders, ComputerCollector } from '../collector';
import { orNull, watts } from '../rounding';
import { PerTick, type Tick } from '../tick';
import { BatteryReader } from './battery';
import { CpuCollector } from './cpu';
import { DiskCollector } from './disks';
import { readAmdCard, scanAmdCards } from './gpu-amd';
import { hasNvidiaDriver, NvidiaStream } from './gpu-nvidia';
import { readIdentity } from './identity';
import { KernelFiles } from './kernel-file';
import { MemoryCollector, readUptimeSeconds } from './memory';
import { NetworkCollector } from './network';
import { RaplCollector } from './rapl';
import { SensorCollector } from './sensors';
import { powerPartOf, summaryOf } from './summary';
import { messageOf } from '@smarteverything/logging';

const PROCESS_COUNT_MS = 5000;

function isProcessName(name: string): boolean {
  const first = name.charCodeAt(0);
  return first >= 48 && first <= 57;
}

export class LinuxComputer implements ComputerCollector {
  private readonly files = new KernelFiles();
  private readonly reported = new Set<string>();
  private readonly cpu = new CpuCollector(this.files, cpus().length);
  private readonly memory = new MemoryCollector(this.files);
  private readonly network = new NetworkCollector(this.files);
  private readonly sensors = new SensorCollector(this.files, (source, cause) => {
    this.reportFailure(source, cause);
  });
  private readonly disks = new DiskCollector(
    this.files,
    (source, cause) => {
      this.reportFailure(source, cause);
    },
    (tick, path) => this.sensors.celsiusAt(tick, path),
  );
  private readonly rapl = new RaplCollector(this.files);
  private readonly battery = new BatteryReader(this.files);
  private readonly amdCards = scanAmdCards();
  private readonly nvidia: NvidiaStream | null;
  private readonly gpuReading = new PerTick<GpuSnapshot[]>();
  private processes = { at: Number.NEGATIVE_INFINITY, count: 0 };

  constructor(private readonly log: Logger) {
    this.nvidia = hasNvidiaDriver() ? new NvidiaStream(log) : null;
  }

  readonly readers: CollectorReaders = {
    summary: (tick) => this.summary(tick),
    cpu: (tick) => {
      const power = this.rapl.read(tick);
      return this.cpu.part(tick, {
        temperature: this.sensors.read(tick).cpuTemperature,
        powerWatts: orNull(power.watts, watts),
        powerLimitWatts: power.limitWatts,
      });
    },
    gpu: (tick) => ({ gpus: this.gpus(tick) }),
    memory: (tick) => this.memory.part(tick),
    disks: (tick) => this.disks.part(tick),
    network: (tick) => this.network.part(tick),
    sensors: (tick) => {
      const reading = this.sensors.read(tick);
      return { sensors: [...reading.sensors], fans: [...reading.fans] };
    },
    power: (tick) => {
      const power = this.rapl.read(tick);
      const part = powerPartOf(
        orNull(power.watts, watts),
        this.gpus(tick),
        this.battery.read(tick),
      );
      return part.totalWatts === null && part.batteryWatts === null ? null : part;
    },
  };

  hello(now: Date): NodeHello {
    return readIdentity(this.cpu.hybrid, readUptimeSeconds(this.files), now, this.features(now));
  }

  track(policy: HistoryPolicy | null): void {
    if (policy === null) {
      this.nvidia?.stop();
      return;
    }
    this.nvidia?.setInterval(policy.interval_ms);
  }

  stop(): void {
    this.nvidia?.stop();
    this.files.closeAll();
  }

  private features(now: Date): ComputerFeature[] {
    const features: ComputerFeature[] = ['cpu', 'memory', 'disks', 'network', 'sensors'];
    const optional: readonly (readonly [boolean, ComputerFeature])[] = [
      [this.sensors.hasFans(now.getTime()), 'fans'],
      [this.rapl.available, 'cpu_power'],
      [this.nvidia !== null || this.amdCards.length > 0, 'gpu'],
      [this.nvidia !== null || this.amdCards.length > 0, 'gpu_processes'],
      [this.battery.present, 'battery'],
    ];
    return [...features, ...optional.flatMap(([present, feature]) => (present ? [feature] : []))];
  }

  private gpus(tick: Tick): GpuSnapshot[] {
    return this.gpuReading.get(tick, () => [
      ...(this.nvidia?.gpus() ?? []),
      ...this.amdCards.map((card) => readAmdCard(this.files, card)),
    ]);
  }

  private summary(tick: Tick): ReturnType<typeof summaryOf> {
    const power = this.rapl.read(tick);
    const network = this.network.totals(tick);
    return summaryOf({
      cpuLoad: this.cpu.loads(tick).load,
      cpuTemperature: this.sensors.read(tick).cpuTemperature,
      cpuWatts: orNull(power.watts, watts),
      memory: this.memory.use(tick),
      gpus: this.gpus(tick),
      download: network.downloadRate,
      upload: network.uploadRate,
      fullestDisk: this.disks.fullest(tick),
      battery: this.battery.read(tick),
      processCount: this.processCount(tick.at),
      uptimeSeconds: readUptimeSeconds(this.files),
    });
  }

  private processCount(at: number): number {
    if (at - this.processes.at >= PROCESS_COUNT_MS) {
      this.processes = { at, count: readdirSync('/proc').filter(isProcessName).length };
    }
    return this.processes.count;
  }

  private reportFailure(source: string, cause: unknown): void {
    const reason = messageOf(cause);
    const signature = `${source}: ${reason}`;
    if (!this.reported.has(signature)) {
      this.reported.add(signature);
      this.log.warn('node.read_failed', { source, reason });
    }
  }
}
