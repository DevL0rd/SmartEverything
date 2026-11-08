import { NativeModule, requireOptionalNativeModule } from 'expo';
import { PLANNER_PHONE_RING_SET, type PlannerPhoneRingSet } from '@smarteverything/domain';
import { z } from 'zod';
import { AppUpdateNeededError } from './health-connect';

const RINGING = z.array(z.string().min(1));

declare class PlannerNative extends NativeModule {
  installPhoneRings(setJson: string): Promise<void>;
  snoozeRing(ringKey: string): Promise<void>;
  dismissRing(ringKey: string): Promise<void>;
  stopRing(ringKey: string): Promise<void>;
  ringingRings(): Promise<unknown>;
  fullScreenAlarmAllowed(): Promise<boolean>;
  openFullScreenAlarmSettings(): Promise<void>;
}

type PlannerName = Exclude<keyof PlannerNative, keyof NativeModule>;

const planner = requireOptionalNativeModule<PlannerNative>('Planner');

function plannerFor(operation: PlannerName): PlannerNative {
  if (planner === null || typeof Reflect.get(planner, operation) !== 'function') {
    throw new AppUpdateNeededError(`phone alarms (${operation})`);
  }
  return planner;
}

export function plannerLinked(): boolean {
  return planner !== null;
}

export async function installPhoneRings(set: PlannerPhoneRingSet): Promise<void> {
  await plannerFor('installPhoneRings').installPhoneRings(
    JSON.stringify(PLANNER_PHONE_RING_SET.parse(set)),
  );
}

export async function snoozeRing(ringKey: string): Promise<void> {
  await plannerFor('snoozeRing').snoozeRing(ringKey);
}

export async function dismissRing(ringKey: string): Promise<void> {
  await plannerFor('dismissRing').dismissRing(ringKey);
}

export async function stopRing(ringKey: string): Promise<void> {
  await plannerFor('stopRing').stopRing(ringKey);
}

export async function ringingRings(): Promise<readonly string[]> {
  return RINGING.parse(await plannerFor('ringingRings').ringingRings());
}

export async function fullScreenAlarmAllowed(): Promise<boolean> {
  return plannerFor('fullScreenAlarmAllowed').fullScreenAlarmAllowed();
}

export async function openFullScreenAlarmSettings(): Promise<void> {
  await plannerFor('openFullScreenAlarmSettings').openFullScreenAlarmSettings();
}
