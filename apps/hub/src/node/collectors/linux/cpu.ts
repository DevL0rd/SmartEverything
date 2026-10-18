import { cpuBusyPercent, type CpuPart } from '@smarteverything/domain';
import { existsSync, readFileSync } from 'node:fs';
import { ghz, orNull, percent, rate } from '../rounding';
import { PerTick, type Tick } from '../tick';
import type { KernelFiles } from './kernel-file';

const CPU_ROOT = '/sys/devices/system/cpu';
const KHZ_PER_GHZ = 1_000_000;
const CPU_LINE = /^cpu(\d+)? /;

export interface CpuLoads {
  readonly load: number;
  readonly cores: readonly number[];
  readonly performanceLoad: number | null;
  readonly efficiencyLoad: number | null;
}

export interface CpuExtras {
  readonly temperature: number | null;
  readonly powerWatts: number | null;
  readonly powerLimitWatts: number | null;
}

interface Topology {
  readonly performance: readonly number[];
  readonly efficiency: readonly number[];
}

export function parseCpuList(text: string): number[] {
  return text
    .trim()
    .split(',')
    .filter((part) => part !== '')
    .flatMap((part) => {
      const [from, to] = part.split('-').map(Number);
      if (from === undefined || Number.isNaN(from)) {
        return [];
      }
      const last = to === undefined || Number.isNaN(to) ? from : to;
      return Array.from({ length: last - from + 1 }, (_, index) => from + index);
    });
}

export function parseCpuTimes(text: string): Map<string, readonly number[]> {
  const times = new Map<string, readonly number[]>();
  for (const line of text.split('\n')) {
    const match = CPU_LINE.exec(line);
    if (match !== null) {
      times.set(
        match[1] === undefined ? 'cpu' : `cpu${match[1]}`,
        line.trim().split(/\s+/).slice(1).map(Number),
      );
    }
  }
  return times;
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readTopology(): Topology | null {
  const core = '/sys/devices/cpu_core/cpus';
  const atom = '/sys/devices/cpu_atom/cpus';
  if (!existsSync(core) || !existsSync(atom)) {
    return null;
  }
  return {
    performance: parseCpuList(readFileSync(core, 'utf8')),
    efficiency: parseCpuList(readFileSync(atom, 'utf8')),
  };
}

function readMaxFrequency(threads: number): number | null {
  const values = Array.from({ length: threads }, (_, cpu) => {
    const path = `${CPU_ROOT}/cpu${String(cpu)}/cpufreq/cpuinfo_max_freq`;
    return existsSync(path) ? Number(readFileSync(path, 'utf8')) : 0;
  });
  const highest = Math.max(0, ...values);
  return highest > 0 ? highest / KHZ_PER_GHZ : null;
}

export class CpuCollector {
  private before = new Map<string, readonly number[]>();
  private readonly topology = readTopology();
  private readonly maxFrequencyGhz: number | null;
  private readonly frequencyPaths: readonly (string | null)[];
  private readonly loadsOnce = new PerTick<CpuLoads>();

  constructor(
    private readonly files: KernelFiles,
    private readonly threads: number,
  ) {
    this.maxFrequencyGhz = readMaxFrequency(threads);
    this.frequencyPaths = Array.from({ length: threads }, (_, cpu) => {
      const path = `${CPU_ROOT}/cpu${String(cpu)}/cpufreq/scaling_cur_freq`;
      return existsSync(path) ? path : null;
    });
  }

  get hybrid(): boolean {
    return this.topology !== null;
  }

  loads(tick: Tick): CpuLoads {
    return this.loadsOnce.get(tick, () => this.readLoads());
  }

  part(tick: Tick, extras: CpuExtras): CpuPart {
    const loads = this.loads(tick);
    const frequencies = this.frequencies();
    const running = frequencies.filter((value) => value > 0);
    return {
      load: percent(loads.load),
      cores: loads.cores.map(percent),
      frequenciesGhz: frequencies.map(ghz),
      performanceLoad: orNull(loads.performanceLoad, percent),
      efficiencyLoad: orNull(loads.efficiencyLoad, percent),
      frequencyGhz: orNull(average(running), ghz),
      maxFrequencyGhz: this.maxFrequencyGhz,
      temperature: extras.temperature,
      powerWatts: extras.powerWatts,
      powerLimitWatts: extras.powerLimitWatts,
      loadAverage: this.loadAverage(),
      throttled: null,
    };
  }

  private readLoads(): CpuLoads {
    const now = parseCpuTimes(this.files.read('/proc/stat'));
    const loads = new Map(
      [...now].map(([name, times]) => [name, cpuBusyPercent(times, this.before.get(name))]),
    );
    this.before = now;
    const cores = Array.from(
      { length: this.threads },
      (_, cpu) => loads.get(`cpu${String(cpu)}`) ?? 0,
    );
    const group = (members: readonly number[]): number | null =>
      average(members.map((cpu) => cores[cpu] ?? 0));
    return {
      load: loads.get('cpu') ?? 0,
      cores,
      performanceLoad: this.topology === null ? null : group(this.topology.performance),
      efficiencyLoad: this.topology === null ? null : group(this.topology.efficiency),
    };
  }

  private frequencies(): number[] {
    return this.frequencyPaths.map((path) =>
      path === null ? 0 : Number(this.files.read(path)) / KHZ_PER_GHZ,
    );
  }

  private loadAverage(): [number, number, number] {
    const [one = 0, five = 0, fifteen = 0] = this.files
      .read('/proc/loadavg')
      .split(' ')
      .slice(0, 3)
      .map(Number);
    return [rate(one), rate(five), rate(fifteen)];
  }
}
