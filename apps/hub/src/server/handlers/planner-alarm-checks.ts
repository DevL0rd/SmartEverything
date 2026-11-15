import {
  ApiError,
  targetCapability,
  type PlannerAlarmSound,
  type PlannerChallenge,
  type PlannerRingTarget,
  type PlannerSunrise,
} from '@smarteverything/domain';
import type { AlarmSounds } from '../../planner/alarm-sound';
import type { Store } from '../../store/store';
import { profileIdOf, roleOfCaller, type Caller } from '../auth';
import { assertDevicesReach } from '../person-scope';
import type { PlannerContext } from './planner-items';

export function requireTargets(
  store: Store,
  targets: readonly PlannerRingTarget[] | undefined,
): void {
  for (const target of targets ?? []) {
    const known =
      target.kind === 'client'
        ? store.clients.find(target.clientId)
        : store.devices.find(target.deviceId);
    if (known === undefined) {
      throw new ApiError('not_found', 'A place the alarm should ring on does not exist.');
    }
    if ('built_in' in known && known.built_in) {
      throw new ApiError('not_found', 'The hub itself is not a place an alarm can ring on.');
    }
  }
}

export function requireAutomation(
  context: PlannerContext,
  caller: Caller,
  automationId: string | null | undefined,
): void {
  if (automationId === null || automationId === undefined) return;
  const automation = context.store.automations.find(automationId);
  const visible =
    automation !== undefined &&
    (roleOfCaller(caller) === 'owner' ||
      automation.author?.profile_id === profileIdOf(context.store, caller));
  if (!visible) throw new ApiError('not_found', 'There is no such automation.');
}

function reachesPhone(store: Store, targets: readonly PlannerRingTarget[]): boolean {
  return targets.some((target) =>
    target.kind === 'client'
      ? store.clients.find(target.clientId)?.platform === 'android'
      : store.devices.find(target.deviceId)?.kind === 'phone',
  );
}

export function requireChallenge(
  store: Store,
  challenge: PlannerChallenge,
  targets: readonly PlannerRingTarget[],
): void {
  if ((challenge.kind === 'qr' || challenge.kind === 'steps') && !reachesPhone(store, targets)) {
    throw new ApiError(
      'invalid_request',
      'A QR code or steps challenge needs a phone to ring on; add a phone to the places this alarm rings.',
    );
  }
}

export function requireSound(
  sounds: Pick<AlarmSounds, 'assertUsable'>,
  profileId: string,
  sound: PlannerAlarmSound | undefined,
): void {
  if (sound !== undefined) sounds.assertUsable(profileId, sound);
}

export function requireSunrise(
  context: PlannerContext,
  caller: Caller,
  sunrise: PlannerSunrise | null | undefined,
): void {
  if (sunrise === null || sunrise === undefined) return;
  for (const lightId of sunrise.lights) {
    const light = context.store.devices.find(lightId);
    const dimmable =
      light !== undefined &&
      (targetCapability(light, 'brightness')?.writable === true ||
        targetCapability(light, 'power')?.writable === true);
    if (!dimmable) {
      throw new ApiError('invalid_request', 'A sunrise light must be a light you can switch on.');
    }
  }
  assertDevicesReach(context.store, caller, sunrise.lights);
}
