import {
  ApiError,
  IR_AC_MODES,
  IR_APPLIANCE_APPLY,
  targetCapability,
  type DeviceRow,
  type IrApplianceApply,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import { ApplianceDevices } from '../../infrared/appliance-devices';
import type { Clock } from '../../clock';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { invalid, outputs, parsed } from '../engine-v3-effects';
import { modeOf } from './action-mode';
import { stampOf } from './command-metadata';
import type { DeviceSetter } from './device-set';
import type { EffectHandlers } from './effect-run';

export interface IrEffectPorts {
  readonly store: Store;
  readonly clock: Pick<Clock, 'now'>;
  readonly setter: Pick<DeviceSetter, 'setTogether'>;
}

const IR_APPLIANCE_PARAMS = z.object({
  appliance: z.string().min(1),
  power: z.enum(['on', 'off', 'keep']).default('keep'),
  mode: z.enum(IR_AC_MODES).optional(),
  temperature: z.number().optional(),
  fan: z.number().optional(),
});

type Ask = z.infer<typeof IR_APPLIANCE_PARAMS>;

interface Change {
  readonly control: string;
  readonly value: JsonValue;
}

function goalOf(ask: Ask): Readonly<Record<string, unknown>> {
  return {
    ...(ask.power === 'keep' ? {} : { on: ask.power === 'on' }),
    ...(ask.mode === undefined ? {} : { mode: ask.mode }),
    ...(ask.temperature === undefined ? {} : { temp: ask.temperature }),
    ...(ask.fan === undefined ? {} : { speed: ask.fan }),
  };
}

function changesOf(goal: IrApplianceApply): readonly Change[] {
  return [
    ...(goal.on === undefined ? [] : [{ control: 'power', value: goal.on }]),
    ...(goal.mode === undefined ? [] : [{ control: 'hvac_mode', value: goal.mode }]),
    ...(goal.temp === undefined ? [] : [{ control: 'target_temperature', value: goal.temp }]),
    ...(goal.speed === undefined ? [] : [{ control: 'fan_mode', value: String(goal.speed) }]),
  ];
}

function requireControls(device: DeviceRow, changes: readonly Change[]): void {
  const missing = changes.filter(({ control }) => {
    const presented = targetCapability(device, control);
    return presented?.writable !== true;
  });
  if (missing.length === 0) return;
  const names = missing.map(({ control }) => control.replaceAll('_', ' ')).join(', ');
  throw new ApiError('command_refused', `${device.name} has no ${names} to set.`);
}

function applianceDevice(ports: IrEffectPorts, devices: ApplianceDevices, id: string): DeviceRow {
  const row = ports.store.irAppliances.find(id);
  if (row === undefined) throw new ApiError('not_found', `There is no IR appliance ${id}.`);
  const deviceId = devices.listing(row).device_id;
  const device = deviceId === null ? undefined : ports.store.devices.find(deviceId);
  if (device === undefined)
    throw new ApiError('not_found', `${row.name} is not shown as a device yet.`);
  return device;
}

function irApplianceSet(ports: IrEffectPorts): EffectHandlers[string] {
  const devices = new ApplianceDevices(ports.store, () => ports.clock.now());
  return async (params, request, run) => {
    const checked = parsed(IR_APPLIANCE_PARAMS, params);
    if (!checked.ok) return checked;
    const asked = goalOf(checked.value);
    if (Object.keys(asked).length === 0)
      return invalid('Choose at least one thing to change on the appliance.');
    const goal = IR_APPLIANCE_APPLY.safeParse(asked);
    if (!goal.success) return invalid(z.prettifyError(goal.error));
    try {
      const device = applianceDevice(ports, devices, checked.value.appliance);
      const changes = changesOf(goal.data);
      requireControls(device, changes);
      await ports.setter.setTogether(
        { deviceId: device.id, changes, mode: modeOf(request), at: stampOf(request.path) },
        run,
      );
      return { ok: true, value: outputs({ device: { device: device.id } }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function irEffects(ports: IrEffectPorts): EffectHandlers {
  return { 'ir.appliance_set': irApplianceSet(ports) };
}
