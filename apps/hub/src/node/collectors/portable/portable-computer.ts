import {
  NODE_HELLO,
  type Battery,
  type ComputerFeature,
  type DisksPart,
  type HistoryPolicy,
  type MemoryPart,
  type NetworkPart,
  type NodeHello,
  type NodeInterface,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { cpus, hostname, networkInterfaces, release, totalmem, uptime } from 'node:os';
import { addressesOf } from '../../../network/lan';
import type { CollectorReaders, ComputerCollector } from '../collector';
import { powerPartOf, summaryOf } from '../linux/summary';
import type { Tick } from '../tick';
import { AsyncReading } from './async-reading';
import { OsCpu } from './os-cpu';
import {
  disksPartOf,
  fullestDiskOf,
  memoryPartOf,
  memoryUseOf,
  NetworkRates,
} from './portable-parts';
import type { PlatformReadings } from './platform-readings';

const log = new Logger('hub.node-readings');

const UNVERIFIED_NOTE = 'support for this system is not verified yet';

export interface PortableComputerOptions {
  readonly machineId: string;
  readonly platform: string;
  readonly readings: PlatformReadings;
  readonly now: () => number;
}

function interfacesOf(): NodeInterface[] {
  const all = networkInterfaces();
  return Object.entries(all).flatMap(([name, addresses]) => {
    const external = addresses?.filter(
      (address) => !address.internal && address.mac !== '00:00:00:00:00:00',
    );
    const first = external?.at(0);
    return first === undefined
      ? []
      : [{ name, mac: first.mac.toLowerCase(), addresses: addressesOf(all, name) }];
  });
}

export class PortableComputer implements ComputerCollector {
  private readonly cpu = new OsCpu();
  private readonly rates = new NetworkRates();
  private readonly reported = new Set<string>();
  private readonly memory = this.reading('memory', async (): Promise<MemoryPart> =>
    memoryPartOf(await this.options.readings.memory()),
  );
  private readonly disks = this.reading('disks', async (): Promise<DisksPart> =>
    disksPartOf(await this.options.readings.disks()),
  );
  private readonly network = this.reading('network', async (): Promise<NetworkPart> => {
    const interfaces = await this.options.readings.interfaces();
    return this.rates.part(interfaces, networkInterfaces(), this.options.now());
  });
  private readonly battery = this.reading('battery', (): Promise<Battery | null> =>
    this.options.readings.battery(),
  );
  private readonly processes = this.reading('processes', (): Promise<number> =>
    this.options.readings.processCount(),
  );

  constructor(private readonly options: PortableComputerOptions) {}

  readonly readers: CollectorReaders = {
    summary: (tick) => this.summary(tick),
    cpu: (tick) => this.cpu.part(tick),
    gpu: () => ({ gpus: [] }),
    memory: () => this.memory.read()?.value ?? null,
    disks: () => this.disks.read()?.value ?? null,
    network: () => this.network.read()?.value ?? null,
    sensors: () => ({ sensors: [], fans: [] }),
    power: () => {
      const battery = this.battery.read()?.value ?? null;
      return battery === null ? null : powerPartOf(null, [], battery);
    },
  };

  async hello(now: Date): Promise<NodeHello> {
    const { readings, machineId, platform } = this.options;
    const identity = await readings.identity();
    log.warn('node.platform_unverified', { platform, note: UNVERIFIED_NOTE });
    await Promise.all([
      this.primed('memory', this.memory),
      this.primed('disks', this.disks),
      this.primed('network', this.network),
      this.primed('battery', this.battery),
      this.primed('processes', this.processes),
    ]);
    const processors = cpus();
    const hasBattery = (this.battery.read()?.value ?? null) !== null;
    return NODE_HELLO.parse({
      machineId,
      hostname: hostname(),
      os: { name: identity.osName, kernel: `${platform} ${release()} (${UNVERIFIED_NOTE})` },
      hardware: {
        vendor: identity.vendor,
        product: identity.product,
        portable: identity.portable || hasBattery,
      },
      cpu: {
        model: processors.at(0)?.model ?? 'Processor',
        threads: Math.max(processors.length, 1),
        hybrid: false,
      },
      memoryBytes: totalmem(),
      interfaces: interfacesOf(),
      bootedAt: new Date(now.getTime() - uptime() * 1000).toISOString(),
      features: this.features(hasBattery),
    });
  }

  track(policy: HistoryPolicy | null): void {
    log.debug('node.readings_tracking', { tracking: policy !== null });
  }

  stop(): void {
    this.options.readings.stop();
  }

  private features(hasBattery: boolean): ComputerFeature[] {
    const features: ComputerFeature[] = ['cpu', 'memory', 'disks', 'network'];
    return hasBattery ? [...features, 'battery'] : features;
  }

  private async primed<T>(source: string, reading: AsyncReading<T>): Promise<void> {
    try {
      await reading.prime();
    } catch (cause) {
      this.reportFailure(source, cause);
    }
  }

  private reading<T>(source: string, load: () => Promise<T>): AsyncReading<T> {
    return new AsyncReading(load, (cause) => {
      this.reportFailure(source, cause);
    });
  }

  private summary(tick: Tick): ReturnType<typeof summaryOf> | null {
    const memory = this.memory.read();
    const disks = this.disks.read();
    const network = this.network.read();
    const processes = this.processes.read();
    if (memory === null || disks === null || network === null || processes === null) return null;
    return summaryOf({
      cpuLoad: this.cpu.load(tick),
      cpuTemperature: null,
      cpuWatts: null,
      memory: memoryUseOf(memory.value),
      gpus: [],
      download: network.value.downloadRate,
      upload: network.value.uploadRate,
      fullestDisk: fullestDiskOf(disks.value),
      battery: this.battery.read()?.value ?? null,
      processCount: processes.value,
      uptimeSeconds: uptime(),
    });
  }

  private reportFailure(source: string, cause: unknown): void {
    const reason = messageOf(cause);
    const signature = `${source}: ${reason}`;
    if (this.reported.has(signature)) return;
    this.reported.add(signature);
    log.warn('node.read_failed', { source, reason });
  }
}
