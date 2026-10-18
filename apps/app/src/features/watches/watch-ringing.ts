import { ValueStore, useSelected } from '../../design/external-store';

const ringing = new ValueStore<ReadonlySet<string>>(new Set());

export function setRinging(deviceId: string, on: boolean): void {
  ringing.update((current) => {
    if (current.has(deviceId) === on) {
      return current;
    }
    const next = new Set(current);
    if (on) {
      next.add(deviceId);
    } else {
      next.delete(deviceId);
    }
    return next;
  });
}

export function useRinging(deviceId: string): boolean {
  return useSelected(ringing, (current) => current.has(deviceId));
}
