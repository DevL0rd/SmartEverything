import {
  deviceTargetOf,
  targetCapability,
  walkSteps,
  type AutomationV2,
  type Role,
} from '@smarteverything/domain';
import { resolveTarget } from '../device-groups/commands';
import { assertPhoneCommandAllowed } from '../phones/phone-access';
import { profileIdOf, type Caller } from '../server/auth';
import { commandRole } from '../server/commands';
import { assertDevicesReach, deviceScopeOf } from '../server/person-scope';
import type { Store } from '../store/store';

function phoneViewerOf(store: Store, caller: Caller): { role: Role; profileId: string } {
  return { role: commandRole(caller), profileId: profileIdOf(store, caller) };
}

export function requirePhoneAccess(
  store: Store,
  caller: Caller,
  actions: readonly { readonly deviceId: string | null; readonly capability: string }[],
): void {
  const viewer = phoneViewerOf(store, caller);
  for (const action of actions) {
    const device = action.deviceId === null ? undefined : store.devices.find(action.deviceId);
    if (device !== undefined) assertPhoneCommandAllowed(device, action.capability, viewer);
  }
}

export function requireReachableTargets(
  store: Store,
  caller: Caller,
  definition: Pick<AutomationV2, 'steps'>,
): void {
  const scoped = deviceScopeOf(store, caller) !== null;
  const viewer = phoneViewerOf(store, caller);
  for (const step of walkSteps(definition.steps)) {
    if (step.do !== 'set') continue;
    const targets = resolveTarget(store, deviceTargetOf(step.target));
    if (scoped) {
      assertDevicesReach(
        store,
        caller,
        targets.map((device) => device.id),
      );
    }
    for (const device of targets) {
      const presented = targetCapability(device, step.control);
      if (presented !== undefined) assertPhoneCommandAllowed(device, presented.key, viewer);
    }
  }
}
