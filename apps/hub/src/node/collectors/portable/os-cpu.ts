import type { CpuPart } from '@smarteverything/domain';
import { cpus, loadavg } from 'node:os';
import { ghz, percent } from '../rounding';
import { PerTick, type Tick } from '../tick';

interface Times {
  readonly busy: number;
  readonly total: number;
}

export interface OsCpus {
  readonly cpus: () => readonly {
    readonly speed: number;
    readonly times: Record<string, number>;
  }[];
  readonly loadavg: () => number[];
}

function timesOf(core: { readonly times: Record<string, number> }): Times {
  const { user = 0, nice = 0, sys = 0, idle = 0, irq = 0 } = core.times;
  return { busy: user + nice + sys + irq, total: user + nice + sys + irq + idle };
}

function shareOf(now: Times, before: Times | undefined): number {
  if (before === undefined || now.total <= before.total) return 0;
  return ((now.busy - before.busy) / (now.total - before.total)) * 100;
}

export class OsCpu {
  private readonly reading = new PerTick<CpuPart>();
  private before: readonly Times[];

  constructor(private readonly os: OsCpus = { cpus, loadavg }) {
    this.before = os.cpus().map(timesOf);
  }

  get threads(): number {
    return this.os.cpus().length;
  }

  part(tick: Tick): CpuPart {
    return this.reading.get(tick, () => this.measure());
  }

  load(tick: Tick): number {
    return this.part(tick).load;
  }

  private measure(): CpuPart {
    const cores = this.os.cpus();
    const now = cores.map(timesOf);
    const shares = now.map((times, index) => shareOf(times, this.before[index]));
    this.before = now;
    const speeds = cores.map((core) => core.speed);
    const known = speeds.length > 0 && speeds.every((speed) => speed > 0);
    const [one = 0, five = 0, fifteen = 0] = this.os.loadavg();
    const load =
      shares.length === 0 ? 0 : shares.reduce((sum, share) => sum + share, 0) / shares.length;
    return {
      load: percent(load),
      cores: shares.map(percent),
      frequenciesGhz: known ? speeds.map((speed) => ghz(speed / 1000)) : [],
      performanceLoad: null,
      efficiencyLoad: null,
      frequencyGhz: known
        ? ghz(speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length / 1000)
        : null,
      maxFrequencyGhz: null,
      temperature: null,
      powerWatts: null,
      powerLimitWatts: null,
      loadAverage: [one, five, fifteen],
      throttled: null,
    };
  }
}
