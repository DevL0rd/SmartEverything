import { ValueStore, usePausable } from '../../../design/external-store';
import { NO_TARGET, type SessionTarget } from '../model/target-model';

const stores = new Map<string, ValueStore<SessionTarget>>();

function storeOf(deviceId: string): ValueStore<SessionTarget> {
  const known = stores.get(deviceId);
  if (known !== undefined) {
    return known;
  }
  const created = new ValueStore<SessionTarget>(NO_TARGET);
  stores.set(deviceId, created);
  return created;
}

export function useSessionTarget(deviceId: string): SessionTarget {
  const store = storeOf(deviceId);
  return usePausable(store.subscribe, () => store.get());
}

export function setSessionTarget(deviceId: string, target: SessionTarget): void {
  storeOf(deviceId).set(target);
}
