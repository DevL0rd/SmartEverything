import { ValueStore, useSelected, useValue } from '../design/external-store';
import { allOff, type DeveloperFlagId, type DeveloperFlags } from './toggles';

const flags = new ValueStore<DeveloperFlags>(allOff());

export function readDeveloperFlags(): DeveloperFlags {
  return flags.get();
}

export function useDeveloperFlags(): DeveloperFlags {
  return useValue(flags);
}

export function useDeveloperFlag(id: DeveloperFlagId): boolean {
  return useSelected(flags, (current) => current[id]);
}

export function activateFlags(next: DeveloperFlags): void {
  flags.set({ ...next });
}

export function activateFlag(id: DeveloperFlagId, value: boolean): void {
  flags.update((current) => ({ ...current, [id]: value }));
}
