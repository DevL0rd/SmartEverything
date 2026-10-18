import {
  effectiveHistoryPolicy,
  historyClassOf,
  type ComputerRole,
  type HistoryPolicy,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

type PolicyStore = Pick<Store, 'settings' | 'devices'>;

export function sourcePolicyOf(store: PolicyStore): (deviceId: string) => HistoryPolicy {
  return (deviceId) =>
    effectiveHistoryPolicy(
      store.settings.read().history_settings,
      deviceId,
      historyClassOf(store.devices.byId(deviceId)),
    );
}

export function computerPolicyOf(
  store: Pick<Store, 'settings'>,
): (deviceId: string, role: ComputerRole) => HistoryPolicy {
  return (deviceId, role) =>
    effectiveHistoryPolicy(
      store.settings.read().history_settings,
      deviceId,
      role === 'hub' ? 'hub' : 'computers',
    );
}
