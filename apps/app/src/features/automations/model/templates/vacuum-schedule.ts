import {
  VACUUM_CLEAN_ROOMS_KEY,
  type AutomationV4,
  type VacuumMode,
} from '@smarteverything/domain';
import { VACUUM_CLEANING_CONTROL, VACUUM_START } from '../consumers/vacuum-schedule';
import { lit } from './build';
import { graphAutomation, graphMaker } from './graph-kit';
import { setDevices, type DeviceChange } from './parts';

export interface VacuumSchedulePlan {
  readonly deviceId: string;
  readonly name: string;
  readonly at: string;
  readonly days: readonly number[];
  readonly rooms: readonly number[];
  readonly mode: VacuumMode | null;
}

export interface VacuumScheduleDraft {
  readonly name: string;
  readonly definition: AutomationV4;
}

function changeOf(plan: VacuumSchedulePlan): DeviceChange {
  const target = { device: plan.deviceId };
  if (plan.rooms.length === 0) {
    return { target, control: VACUUM_CLEANING_CONTROL, to: VACUUM_START };
  }
  return {
    target,
    control: VACUUM_CLEAN_ROOMS_KEY,
    to: { rooms: [...plan.rooms], ...(plan.mode === null ? {} : { mode: plan.mode }) },
  };
}

export function vacuumScheduleAutomation(plan: VacuumSchedulePlan): VacuumScheduleDraft {
  const m = graphMaker(`vacuum-schedule:${plan.deviceId}`);
  const definition = graphAutomation({
    triggers: [m.trigger('time1', 'trigger.time', { at: lit(plan.at), days: lit([...plan.days]) })],
    body: [setDevices(m, 'clean', changeOf(plan))],
  });
  return { name: plan.name, definition };
}
