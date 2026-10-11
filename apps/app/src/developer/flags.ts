import { allOff, type DeveloperFlagId, type DeveloperFlags } from './toggles';

const active: Record<DeveloperFlagId, boolean> = allOff();

export const developerFlags: DeveloperFlags = active;

export function activateFlags(next: DeveloperFlags): void {
  Object.assign(active, next);
}

export function activateFlag(id: DeveloperFlagId, value: boolean): void {
  active[id] = value;
}
