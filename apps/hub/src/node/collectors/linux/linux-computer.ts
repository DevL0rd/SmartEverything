import { COMPUTER_SNAPSHOT, type ComputerSnapshot, type NodeHello } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { cpus } from 'node:os';
import type { ComputerCollector } from '../collector';
import { CpuCollector } from './cpu';
import { DiskCollector } from './disks';
import { readAmdCard, scanAmdCards } from './gpu-amd';
import { hasNvidiaDriver, NvidiaStream } from './gpu-nvidia';
import { readIdentity } from './identity';
import { KernelFiles } from './kernel-file';
import { readMemory, readUptimeSeconds } from './memory';
import { NetworkCollector } from './network';
import { RaplCollector } from './rapl';
import { SensorCollector } from './sensors';

export class LinuxComputer implements ComputerCollector {
  private readonly files = new KernelFiles();
  private readonly cpu = new CpuCollector(this.files, cpus().length);
  private readonly disks = new DiskCollector(this.files);
  private readonly network = new NetworkCollector(this.files);
  private readonly sensors = new SensorCollector(this.files);
  private readonly rapl = new RaplCollector(this.files);
  private readonly amdCards = scanAmdCards();
  private readonly nvidia: NvidiaStream | null;

  constructor(log: Logger) {
    this.nvidia = hasNvidiaDriver() ? new NvidiaStream(log) : null;
  }

  hello(now: Date): NodeHello {
    return readIdentity(this.cpu.hybrid, readUptimeSeconds(this.files), now);
  }

  snapshot(now: Date): ComputerSnapshot {
    const at = now.getTime();
    const cpu = this.cpu.read();
    const sensors = this.sensors.read(at);
    const power = this.rapl.read(at);
    return COMPUTER_SNAPSHOT.parse({
      at: now.toISOString(),
      uptimeSeconds: readUptimeSeconds(this.files),
      cpu: {
        ...cpu,
        temperature: sensors.cpuTemperature,
        powerWatts: power.watts,
        powerLimitWatts: power.limitWatts,
      },
      memory: readMemory(this.files),
      disks: this.disks.read(at),
      network: this.network.read(at),
      gpus: [
        ...(this.nvidia?.gpus() ?? []),
        ...this.amdCards.map((card) => readAmdCard(this.files, card)),
      ],
      fans: sensors.fans,
      sensors: sensors.sensors,
    });
  }

  pace(intervalMs: number): void {
    this.nvidia?.pace(intervalMs);
  }

  stop(): void {
    this.nvidia?.stop();
    this.files.closeAll();
  }
}
