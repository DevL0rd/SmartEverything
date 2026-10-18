import type { Battery } from '@smarteverything/domain';
import type { RunProgram } from '../../run-program';
import type { ToolProbe } from './tool-probe';

const BATTERY_PREFIX = '/org/freedesktop/UPower/devices/battery_';

const STATES: Readonly<Record<string, Battery['state']>> = {
  charging: 'charging',
  discharging: 'discharging',
  empty: 'discharging',
  'fully-charged': 'full',
  'pending-charge': 'idle',
  'pending-discharge': 'idle',
};

const PLUGGED_STATES: ReadonlySet<Battery['state']> = new Set(['charging', 'full', 'idle']);

const MINUTES_PER_UNIT: Readonly<Record<string, number>> = {
  seconds: 1 / 60,
  minutes: 1,
  hours: 60,
  days: 1440,
};

function fields(text: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const line of text.split('\n')) {
    const split = line.indexOf(':');
    if (split > 0) {
      found.set(line.slice(0, split).trim(), line.slice(split + 1).trim());
    }
  }
  return found;
}

function numberOf(text: string | undefined): number | null {
  const value = Number.parseFloat(text ?? '');
  return Number.isFinite(value) ? value : null;
}

function minutesOf(text: string | undefined): number | null {
  const match = /^([\d.]+)\s+(\w+)$/.exec(text ?? '');
  const unit = MINUTES_PER_UNIT[match?.[2] ?? ''];
  const amount = numberOf(match?.[1]);
  return unit === undefined || amount === null ? null : Math.round(amount * unit);
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function parseBattery(text: string): Battery | null {
  const read = fields(text);
  const level = numberOf(read.get('percentage'));
  if (level === null || read.get('present') === 'no') {
    return null;
  }
  const state = STATES[read.get('state') ?? ''] ?? 'unknown';
  const health = numberOf(read.get('capacity'));
  const draw = numberOf(read.get('energy-rate'));
  return {
    level: clampPercent(level),
    state,
    pluggedIn: PLUGGED_STATES.has(state),
    minutesLeft: minutesOf(read.get('time to empty') ?? read.get('time to full')),
    healthPercent: health === null ? null : clampPercent(health),
    drawWatts: draw === null ? null : Math.max(0, draw),
  };
}

export class UpowerBattery {
  constructor(
    private readonly run: RunProgram,
    private readonly probe: ToolProbe,
  ) {}

  supported(): Promise<boolean> {
    return this.probe.available('upower', ['--version']);
  }

  async read(): Promise<Battery | null> {
    if (!(await this.supported())) {
      return null;
    }
    const devices = (await this.run('upower', ['-e'])).split('\n');
    const path = devices.find((device) => device.trim().startsWith(BATTERY_PREFIX));
    return path === undefined ? null : parseBattery(await this.run('upower', ['-i', path.trim()]));
  }
}
