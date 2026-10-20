import { z } from 'zod';
import type { JsonValue } from '@smarteverything/domain';
import type { SignalBus } from '../../signals/bus';
import type { WorldReadDeps } from './deps';
import { parseInputs } from './inputs';
import {
  ReadFailure,
  outputsOf,
  type ReadHandlers,
  type ReadInputs,
  type ReadResult,
} from './read-port';

export interface SignalReads {
  readonly latest: SignalBus['latest'];
}

const ID = z.union([
  z.string().min(1),
  z.strictObject({ computer: z.string().min(1) }).transform((ref) => ref.computer),
  z.strictObject({ phone: z.string().min(1) }).transform((ref) => ref.phone),
]);

const MACHINE = z.object({ computer: ID.optional(), phone: ID.optional() });

const SECRET = z.object({ secret: z.string().min(1) });

const FORECAST = z.object({
  hours: z.number().int().min(1).max(48),
  rainAbove: z.number().min(0).max(100),
});

const LATEST = z.object({
  source: z.string().min(1),
  kind: z.string().min(1),
  subject: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
});

const COMPUTER_KEYS: Readonly<Record<string, string>> = {
  locked: 'locked',
  focusedApp: 'focused_app',
  signedInUser: 'signed_in_user',
  charging: 'charging',
  batteryLevel: 'battery_level',
  cpuLoad: 'cpu_load',
  gpuLoad: 'gpu_load',
  downloadRate: 'download_rate',
  uploadRate: 'upload_rate',
};

const PHONE_KEYS: Readonly<Record<string, string>> = {
  battery: 'battery',
  charging: 'charging',
  ringerMode: 'ringer_mode',
  dnd: 'dnd',
  screenOn: 'screen_on',
};

function machineReadings(
  deps: WorldReadDeps,
  deviceId: string,
  keys: Readonly<Record<string, string>>,
): ReadResult {
  if (deps.store.devices.find(deviceId) === undefined) {
    throw new ReadFailure('NotFound', `There is no device ${deviceId}`);
  }
  return outputsOf(
    Object.fromEntries(
      Object.entries(keys).map(([output, capability]) => [
        output,
        deps.observed(deviceId, capability),
      ]),
    ),
  );
}

function extreme(
  values: readonly number[],
  pick: (...numbers: number[]) => number,
): number | undefined {
  return values.length === 0 ? undefined : pick(...values);
}

function forecastRead(deps: WorldReadDeps, inputs: ReadInputs): ReadResult {
  const { hours, rainAbove } = parseInputs('weather.forecast', FORECAST, inputs);
  const { forecast } = deps.store.weather.read();
  if (forecast === null) return outputsOf({});
  const from = deps.clock.now().getTime() - 3_600_000;
  const ahead = forecast.hourly.filter((hour) => Date.parse(hour.at) > from).slice(0, hours);
  const chances = ahead.flatMap((hour) =>
    hour.precipitationChance === null ? [] : [hour.precipitationChance],
  );
  const today = forecast.daily[0];
  return outputsOf({
    rainChance: extreme(chances, Math.max),
    rainHours: chances.filter((chance) => chance >= rainAbove).length,
    minTemperature: extreme(
      ahead.map((hour) => hour.temperatureC),
      Math.min,
    ),
    maxTemperature: extreme(
      ahead.map((hour) => hour.temperatureC),
      Math.max,
    ),
    maxWind: extreme(
      ahead.map((hour) => hour.windKmh),
      Math.max,
    ),
    todayMin: today?.minC,
    todayMax: today?.maxC,
  });
}

export function integrationHandlers(deps: WorldReadDeps, signals: SignalReads): ReadHandlers {
  return {
    'var.secret': (inputs): ReadResult => {
      const { secret } = parseInputs('var.secret', SECRET, inputs);
      return outputsOf({ secret });
    },
    'computer.read': (inputs): ReadResult => {
      const { computer } = parseInputs('computer.read', MACHINE, inputs);
      if (computer === undefined)
        throw new ReadFailure('Invalid', 'computer.read needs a computer');
      return machineReadings(deps, computer, COMPUTER_KEYS);
    },
    'phone.read': (inputs): ReadResult => {
      const { phone } = parseInputs('phone.read', MACHINE, inputs);
      if (phone === undefined) throw new ReadFailure('Invalid', 'phone.read needs a phone');
      return machineReadings(deps, phone, PHONE_KEYS);
    },
    'weather.forecast': (inputs): ReadResult => forecastRead(deps, inputs),
    'signal.latest': (inputs): ReadResult => {
      const filter = parseInputs('signal.latest', LATEST, inputs);
      const [newest] = signals.latest(filter);
      if (newest === undefined) return outputsOf({ found: false });
      const data: JsonValue = newest.data;
      return outputsOf({
        found: true,
        value: newest.value,
        previous: newest.previous ?? undefined,
        subject: newest.subject ?? undefined,
        at: newest.at,
        data,
      });
    },
  };
}
