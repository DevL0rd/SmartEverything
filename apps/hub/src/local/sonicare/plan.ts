import {
  BRUSH_INTENSITIES,
  sensorMaskOf,
  type BrushLinkPlan,
  type BrushStep,
  type DeviceRow,
  mayWriteHandle,
} from '@smarteverything/domain';
import {
  brushLinkPlanParts,
  clockWriteStep,
  intensityWriteStep,
  modeWriteStep,
  routineIdOf,
} from '@smarteverything/ble';
import { entryConfigOf, entryProfileOf, entrySettingsOf } from './config';
import type { DeviceState } from '../toothbrush/fleet';

function reconcileSteps(state: DeviceState, nowSeconds: number): BrushStep[] {
  const profile = entryProfileOf(state.entry);
  const settings = entrySettingsOf(state.entry);
  const config = entryConfigOf(state.entry);
  const idle =
    state.runtime.state.activity !== 'brushing' && state.runtime.state.activity !== 'paused';
  if (!mayWriteHandle(profile, settings) || !idle) {
    return [];
  }
  return [
    ...(config.identity.clockIsUnix === false ? [clockWriteStep(profile, nowSeconds)] : []),
    ...(settings.defaultMode === null
      ? []
      : [modeWriteStep(profile, routineIdOf(settings.defaultMode))]),
    ...(settings.defaultIntensity === null
      ? []
      : [intensityWriteStep(profile, BRUSH_INTENSITIES.indexOf(settings.defaultIntensity))]),
  ];
}

export function planOf(
  device: Pick<DeviceRow, 'id'>,
  state: DeviceState,
  holder: boolean,
  now: Date,
): BrushLinkPlan {
  const profile = entryProfileOf(state.entry);
  const settings = entrySettingsOf(state.entry);
  const parts = brushLinkPlanParts(
    profile,
    sensorMaskOf(settings.sensors, profile),
    state.transferDropped,
  );
  return {
    deviceId: device.id,
    address: state.entry.address,
    transport: parts.transport,
    brand: parts.brand,
    bonded: profile.bonded,
    adverts: parts.adverts,
    prepare: [...parts.prepare],
    subscriptions: [...parts.subscriptions],
    reads: [...parts.reads],
    sync: [...parts.sync],
    initial: [...parts.initial, ...reconcileSteps(state, Math.floor(now.getTime() / 1000))],
    policy: settings.policy,
    holder,
  };
}
