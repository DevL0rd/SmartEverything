import { accessSync, constants, existsSync, readdirSync, readFileSync } from 'node:fs';
import { PerTick, type Tick } from '../tick';
import type { KernelFiles } from './kernel-file';

const POWERCAP_ROOT = '/sys/class/powercap';
const MICRO = 1_000_000;

interface Energy {
  readonly microjoules: number;
  readonly at: number;
}

export interface PackagePower {
  readonly watts: number | null;
  readonly limitWatts: number | null;
}

function packageDomain(): string | null {
  const domain = readdirSync(POWERCAP_ROOT)
    .filter((name) => name.startsWith('intel-rapl:'))
    .map((name) => `${POWERCAP_ROOT}/${name}`)
    .find(
      (path) =>
        existsSync(`${path}/name`) && readFileSync(`${path}/name`, 'utf8').trim() === 'package-0',
    );
  if (domain === undefined) {
    return null;
  }
  try {
    accessSync(`${domain}/energy_uj`, constants.R_OK);
    return domain;
  } catch (cause) {
    if (cause instanceof Error) {
      return null;
    }
    throw cause;
  }
}

function limitOf(domain: string): number | null {
  const limits = readdirSync(domain)
    .filter((name) => /^constraint_\d+_max_power_uw$/.test(name))
    .map((name) => Number(readFileSync(`${domain}/${name}`, 'utf8')));
  const highest = Math.max(0, ...limits);
  return highest > 0 ? highest / MICRO : null;
}

export class RaplCollector {
  private readonly domain = existsSync(POWERCAP_ROOT) ? packageDomain() : null;
  private readonly limitWatts = this.domain === null ? null : limitOf(this.domain);
  private before: Energy | null = null;
  private readonly power = new PerTick<PackagePower>();

  constructor(private readonly files: KernelFiles) {}

  get available(): boolean {
    return this.domain !== null;
  }

  read(tick: Tick): PackagePower {
    return this.power.get(tick, () => this.measure(tick.at));
  }

  private measure(at: number): PackagePower {
    const domain = this.domain;
    if (domain === null) {
      return { watts: null, limitWatts: null };
    }
    const now = { microjoules: Number(this.files.read(`${domain}/energy_uj`)), at };
    const before = this.before;
    this.before = now;
    if (before === null || now.at <= before.at) {
      return { watts: null, limitWatts: this.limitWatts };
    }
    const delta = now.microjoules - before.microjoules;
    const used =
      delta >= 0 ? delta : delta + Number(this.files.read(`${domain}/max_energy_range_uj`));
    return { watts: used / MICRO / ((now.at - before.at) / 1000), limitWatts: this.limitWatts };
  }
}
