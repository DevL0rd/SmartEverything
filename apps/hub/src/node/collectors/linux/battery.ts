import type { Battery } from '@smarteverything/domain';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { orNull, percent, watts } from '../rounding';
import { PerTick, type Tick } from '../tick';
import type { KernelFiles } from './kernel-file';

const SUPPLY_ROOT = '/sys/class/power_supply';
const MICRO = 1_000_000;
const MINUTES_PER_HOUR = 60;

type BatteryState = Battery['state'];

const STATES: Readonly<Record<string, BatteryState>> = {
  charging: 'charging',
  discharging: 'discharging',
  full: 'full',
  'not charging': 'idle',
};

export function batteryStateOf(status: string): BatteryState {
  return STATES[status.trim().toLowerCase()] ?? 'unknown';
}

function typeOf(directory: string): string {
  const path = `${directory}/type`;
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
}

function minutesLeft(
  state: BatteryState,
  now: number | null,
  full: number | null,
  draw: number | null,
): number | null {
  if (draw === null || draw <= 0 || now === null) {
    return null;
  }
  const remaining =
    state === 'discharging' ? now : state === 'charging' && full !== null ? full - now : null;
  return remaining === null ? null : Math.round((remaining / draw) * MINUTES_PER_HOUR);
}

export class BatteryReader {
  private readonly battery = new PerTick<Battery | null>();
  private readonly directories = existsSync(SUPPLY_ROOT)
    ? readdirSync(SUPPLY_ROOT).map((name) => `${SUPPLY_ROOT}/${name}`)
    : [];
  private readonly directory =
    this.directories.find(
      (candidate) => typeOf(candidate) === 'Battery' && !existsSync(`${candidate}/scope`),
    ) ?? null;
  private readonly attributes = new Set(this.directory === null ? [] : readdirSync(this.directory));
  private readonly mains = this.directories.filter((directory) => typeOf(directory) === 'Mains');

  constructor(private readonly files: KernelFiles) {}

  get present(): boolean {
    return this.directory !== null;
  }

  read(tick: Tick): Battery | null {
    return this.battery.get(tick, () => this.measure());
  }

  private numberOf(name: string): number | null {
    if (this.directory === null || !this.attributes.has(name)) {
      return null;
    }
    const value = Number(this.files.read(`${this.directory}/${name}`));
    return Number.isFinite(value) ? value : null;
  }

  private energyOf(suffix: 'now' | 'full' | 'full_design'): number | null {
    const energy = this.numberOf(`energy_${suffix}`);
    if (energy !== null) {
      return energy;
    }
    const charge = this.numberOf(`charge_${suffix}`);
    const volts = this.numberOf('voltage_now');
    return charge === null || volts === null ? null : (charge * volts) / MICRO;
  }

  private drawOf(): number | null {
    const power = this.numberOf('power_now');
    if (power !== null) {
      return power / MICRO;
    }
    const current = this.numberOf('current_now');
    const volts = this.numberOf('voltage_now');
    return current === null || volts === null ? null : (current * volts) / (MICRO * MICRO);
  }

  private pluggedIn(state: BatteryState): boolean {
    if (this.mains.length === 0) {
      return state !== 'discharging';
    }
    return this.mains.some((directory) => Number(this.files.read(`${directory}/online`)) === 1);
  }

  private measure(): Battery | null {
    if (this.directory === null) {
      return null;
    }
    const state = batteryStateOf(this.files.read(`${this.directory}/status`));
    const now = this.energyOf('now');
    const full = this.energyOf('full');
    const design = this.energyOf('full_design');
    const draw = this.drawOf();
    const capacity = this.numberOf('capacity');
    const level = capacity ?? (now !== null && full !== null && full > 0 ? (now / full) * 100 : 0);
    return {
      level: percent(level),
      state,
      pluggedIn: this.pluggedIn(state),
      minutesLeft: minutesLeft(state, now, full, draw === null ? null : draw * MICRO),
      healthPercent: orNull(
        full !== null && design !== null && design > 0 ? (full / design) * 100 : null,
        percent,
      ),
      drawWatts: orNull(draw, watts),
    };
  }
}
