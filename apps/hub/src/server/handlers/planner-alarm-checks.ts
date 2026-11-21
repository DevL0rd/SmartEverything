import {
  ApiError,
  targetCapability,
  type PlannerChallenge,
  type PlannerRingTarget,
  type PlannerSunrise,
} from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';
import { profileIdOf, roleOfCaller, type Caller } from '../auth';
import type { Refusal } from '../person-access';
import { devicesReachWhy } from '../person-scope-units';

export function requireTargets(
  store: HostStore,
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
  context: { readonly store: Pick<HostStore, 'automations'> },
  caller: Caller,
  automationId: string | null | undefined,
): void {
  if (automationId === null || automationId === undefined) return;
  const automation = context.store.automations.find(automationId);
  const visible =
    automation !== undefined &&
    (roleOfCaller(caller) === 'owner' || automation.author?.profile_id === profileIdOf(caller));
  if (!visible) throw new ApiError('not_found', 'There is no such automation.');
}

function reachesPhone(store: HostStore, targets: readonly PlannerRingTarget[]): boolean {
  return targets.some((target) =>
    target.kind === 'client'
      ? store.clients.find(target.clientId)?.platform === 'android'
      : store.devices.find(target.deviceId)?.kind === 'phone',
  );
}

export function requireChallenge(
  store: HostStore,
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

export function sunriseRefusal(
  store: HostStore,
  caller: Caller,
  sunrise: PlannerSunrise | null | undefined,
): Refusal | null {
  if (sunrise === null || sunrise === undefined) return null;
  for (const lightId of sunrise.lights) {
    const light = store.devices.find(lightId);
    const dimmable =
      light !== undefined &&
      (targetCapability(light, 'brightness')?.writable === true ||
        targetCapability(light, 'power')?.writable === true);
    if (!dimmable) {
      throw new ApiError('invalid_request', 'A sunrise light must be a light you can switch on.');
    }
  }
  return devicesReachWhy(store, caller, sunrise.lights);
}
