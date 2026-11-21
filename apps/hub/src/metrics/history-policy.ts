import {
  effectiveHistoryPolicy,
  historyClassOf,
  type HistoryPolicy,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

type PolicyStore = Pick<Store, 'live'>;

export function sourcePolicyOf(store: PolicyStore): (deviceId: string) => HistoryPolicy {
  return (deviceId) =>
    effectiveHistoryPolicy(
      store.live.home.settings.read().history_settings,
      deviceId,
      historyClassOf(store.live.home.devices.byId(deviceId)),
    );
}

export function computerPolicyOf(store: Pick<Store, 'live'>): (deviceId: string) => HistoryPolicy {
  return (deviceId) =>
    effectiveHistoryPolicy(store.live.home.settings.read().history_settings, deviceId, 'computers');
}
