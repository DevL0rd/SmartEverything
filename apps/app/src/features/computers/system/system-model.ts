import type {
  Battery,
  PowerMode,
  ServiceOperation,
  ServiceRow,
  TimerRow,
  UsbDevice,
} from '@smarteverything/domain';
import type { Tone } from '../../../components/tone';
import { decimal, withUnit } from '../../../format/number';
import { compareText, joinParts } from '../../../format/text';
import { duration, moment } from '../../../format/time';

const POWER_MODE_LABEL: Readonly<Record<PowerMode, string>> = {
  power_saver: 'Power saver',
  balanced: 'Balanced',
  performance: 'Performance',
};

export function powerModeOptions(
  offered: readonly PowerMode[],
): readonly { readonly value: PowerMode; readonly label: string }[] {
  return offered.map((value) => ({ value, label: POWER_MODE_LABEL[value] }));
}

export interface BatteryView {
  readonly percent: number;
  readonly state: string;
  readonly line: string;
  readonly tone: 'positive' | 'critical';
}

const LOW_BATTERY = 20;

function stateText(battery: Battery): string {
  const left = battery.minutesLeft === null ? null : duration(battery.minutesLeft * 60);
  switch (battery.state) {
    case 'charging':
      return joinParts(['Charging', left === null ? null : `full in ${left}`]);
    case 'discharging':
      return joinParts(['On battery', left === null ? null : `${left} left`]);
    case 'full':
      return 'Fully charged';
    case 'idle':
      return 'Plugged in, not charging';
    case 'unknown':
      return battery.pluggedIn ? 'Plugged in' : 'On battery';
  }
}

export function batteryView(battery: Battery): BatteryView {
  const percent = Math.round(battery.level);
  const state = stateText(battery);
  return {
    percent,
    state,
    tone: percent <= LOW_BATTERY && battery.state !== 'charging' ? 'critical' : 'positive',
    line: joinParts([
      `${decimal(percent)} %`,
      state,
      battery.healthPercent === null
        ? null
        : `health ${decimal(Math.round(battery.healthPercent))} %`,
      battery.drawWatts === null ? null : withUnit(decimal(battery.drawWatts, 1), 'W'),
    ]),
  };
}

export interface ServiceState {
  readonly word: string;
  readonly tone: Tone;
  readonly running: boolean;
}

export function serviceState(state: ServiceRow['state']): ServiceState {
  switch (state) {
    case 'active':
      return { word: 'Running', tone: 'positive', running: true };
    case 'activating':
      return { word: 'Starting', tone: 'info', running: true };
    case 'failed':
      return { word: 'Failed', tone: 'critical', running: false };
    case 'inactive':
    case 'other':
      return { word: 'Stopped', tone: 'faint', running: false };
  }
}

export interface ServiceGroups {
  readonly yours: readonly ServiceRow[];
  readonly system: readonly ServiceRow[];
}

function byUnit(left: ServiceRow, right: ServiceRow): number {
  return compareText(left.unit, right.unit);
}

export function serviceGroups(services: readonly ServiceRow[]): ServiceGroups {
  return {
    yours: services.filter((service) => !service.system).sort(byUnit),
    system: services.filter((service) => service.system).sort(byUnit),
  };
}

export function serviceTitle(service: Pick<ServiceRow, 'unit' | 'description'>): string {
  return service.description === '' ? service.unit : service.description;
}

export function serviceSubtitle(service: Pick<ServiceRow, 'unit' | 'description'>): string | null {
  return service.description === '' ? null : service.unit;
}

export interface HubServiceAsk {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
}

export function hubServiceAsk(
  operation: ServiceOperation,
  service: string,
  hubName: string,
): HubServiceAsk {
  if (operation === 'disable') {
    return {
      title: `Turn off start at login for ${service}?`,
      body: `The hub on ${hubName} won’t start by itself after a restart.`,
      confirmLabel: 'Turn off',
    };
  }
  const restart = operation === 'restart';
  return {
    title: `${restart ? 'Restart' : 'Stop'} ${service}?`,
    body: `${restart ? 'Restarting' : 'Stopping'} this service stops the hub on ${hubName}. SmartEverything disconnects from everything on it until the hub is running again.`,
    confirmLabel: restart ? 'Restart' : 'Stop',
  };
}

export function timerLine(timer: TimerRow, now: number): string {
  const next = timer.nextRunAt === null ? 'Not scheduled' : `Next ${moment(timer.nextRunAt, now)}`;
  const last = timer.lastRunAt === null ? null : `last ${moment(timer.lastRunAt, now)}`;
  return joinParts([next, last]);
}

export function usbLine(device: UsbDevice): string {
  return joinParts([
    device.vendor,
    device.speedMbps === null ? null : `${decimal(device.speedMbps)} Mb/s`,
  ]);
}
