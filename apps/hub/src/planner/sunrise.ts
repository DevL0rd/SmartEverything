import {
  ApiError,
  targetCapability,
  type DeviceRow,
  type JsonValue,
  type PlannerAlarmRow,
  type PlannerSunrise,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { RunningHub } from '../hub';
import type { Store } from '../store/store';

const MINUTE_MS = 60_000;

const LOWEST_LEVEL = 1;

const HIGHEST_LEVEL = 100;

const STEPS = HIGHEST_LEVEL - LOWEST_LEVEL + 1;

export type SunriseStore = Pick<Store, 'devices'>;

export interface SunriseRampOptions {
  readonly store: SunriseStore;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly submit: RunningHub['submit'];
  readonly log: Logger;
}

interface Ramp {
  readonly alarmId: string;
  readonly sunrise: PlannerSunrise;
  readonly startMs: number;
  readonly spacingMs: number;
}

interface Armed {
  readonly key: string;
  readonly cancel: Cancel;
}

interface NumberControl {
  readonly key: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export function rampSpacingMs(minutes: number): number {
  return (minutes * MINUTE_MS) / (STEPS - 1);
}

export function rampStartAt(sunrise: PlannerSunrise, ringAt: Date): Date {
  return new Date(ringAt.getTime() - sunrise.minutes * MINUTE_MS);
}

function numberControl(device: DeviceRow, reference: string): NumberControl | undefined {
  const presented = targetCapability(device, reference);
  const descriptor = presented?.capability.value;
  if (presented?.writable !== true || descriptor?.kind !== 'number') {
    return undefined;
  }
  return {
    key: presented.key,
    min: descriptor.min,
    max: descriptor.max,
    step: descriptor.step,
  };
}

function scaled(control: NumberControl, fraction: number): number {
  const raw = control.min + fraction * (control.max - control.min);
  const snapped = control.min + Math.round((raw - control.min) / control.step) * control.step;
  return Math.min(control.max, Math.max(control.min, snapped));
}

export function levelAt(index: number): number {
  return LOWEST_LEVEL + index;
}

export class SunriseRamp {
  private readonly armed = new Map<string, Armed>();

  constructor(private readonly options: SunriseRampOptions) {}

  arm(alarm: PlannerAlarmRow, ringAt: Date): void {
    const { sunrise } = alarm;
    const now = this.options.clock.now().getTime();
    if (sunrise === null || ringAt.getTime() <= now) {
      this.cancel(alarm.id);
      return;
    }
    const key = `${ringAt.toISOString()}|${JSON.stringify(sunrise)}`;
    if (this.armed.get(alarm.id)?.key === key) {
      return;
    }
    this.cancel(alarm.id);
    const startMs = rampStartAt(sunrise, ringAt).getTime();
    const ramp: Ramp = {
      alarmId: alarm.id,
      sunrise,
      startMs,
      spacingMs: rampSpacingMs(sunrise.minutes),
    };
    const first =
      now < startMs ? 0 : Math.min(STEPS - 1, Math.floor((now - startMs) / ramp.spacingMs));
    this.schedule(ramp, key, first);
  }

  cancel(alarmId: string): void {
    this.armed.get(alarmId)?.cancel();
    this.armed.delete(alarmId);
  }

  cancelAll(): void {
    for (const alarmId of [...this.armed.keys()]) {
      this.cancel(alarmId);
    }
  }

  private schedule(ramp: Ramp, key: string, index: number): void {
    const at = new Date(Math.round(ramp.startMs + index * ramp.spacingMs));
    const cancel = this.options.clock.at(at, () => {
      this.apply(ramp, index);
      if (index < STEPS - 1) {
        this.schedule(ramp, key, index + 1);
      } else {
        this.armed.delete(ramp.alarmId);
      }
    });
    this.armed.set(ramp.alarmId, { key, cancel });
  }

  private apply(ramp: Ramp, index: number): void {
    for (const deviceId of ramp.sunrise.lights) {
      const device = this.options.store.devices.find(deviceId);
      if (device === undefined) {
        this.options.log.warn('planner.sunrise_light_missing', {
          alarmId: ramp.alarmId,
          deviceId,
        });
        continue;
      }
      this.send(ramp, device, index);
    }
  }

  private send(ramp: Ramp, device: DeviceRow, index: number): void {
    const brightness = numberControl(device, 'brightness');
    const temperature = ramp.sunrise.colour
      ? numberControl(device, 'color_temperature')
      : undefined;
    const changes: { readonly capability: string; readonly value: JsonValue }[] = [];
    if (index === 0) {
      changes.push({ capability: 'power', value: true });
    }
    if (brightness !== undefined) {
      changes.push({
        capability: brightness.key,
        value: scaled(brightness, (levelAt(index) - LOWEST_LEVEL) / (HIGHEST_LEVEL - LOWEST_LEVEL)),
      });
    }
    if (temperature !== undefined) {
      changes.push({
        capability: temperature.key,
        value: scaled(temperature, index / (STEPS - 1)),
      });
    }
    this.submit(ramp, device.id, changes);
  }

  private submit(
    ramp: Ramp,
    deviceId: string,
    changes: readonly { readonly capability: string; readonly value: JsonValue }[],
  ): void {
    if (changes.length === 0) {
      return;
    }
    try {
      this.options.submit(
        changes.map((change) => ({
          deviceId,
          capability: change.capability,
          value: change.value,
          source: 'automation',
          requestedBy: null,
        })),
      );
    } catch (cause) {
      if (!(cause instanceof ApiError)) {
        throw cause;
      }
      this.options.log.warn('planner.sunrise_step_refused', {
        alarmId: ramp.alarmId,
        deviceId,
        reason: cause.message,
      });
    }
  }
}
