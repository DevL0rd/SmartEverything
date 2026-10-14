import { ValueStore, useValue } from '../design/external-store';
import { allOff, type DeveloperFlagId, type DeveloperFlags } from './toggles';

const active: Record<DeveloperFlagId, boolean> = allOff();

export const developerFlags: DeveloperFlags = active;
const snapshots = new ValueStore<DeveloperFlags>({ ...active });

export function useDeveloperFlags(): DeveloperFlags {
  return useValue(snapshots);
}

export function activateFlags(next: DeveloperFlags): void {
  Object.assign(active, next);
  snapshots.set({ ...active });
}

export function activateFlag(id: DeveloperFlagId, value: boolean): void {
  active[id] = value;
  snapshots.set({ ...active });
}
