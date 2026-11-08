import { ValueStore, useSelected, useValue } from '../design/external-store';
import { allOff, type DeveloperFlagId, type DeveloperFlags } from './toggles';

const flags = new ValueStore<DeveloperFlags>(allOff());

const watchers = new Set<() => void>();

export function readDeveloperFlags(): DeveloperFlags {
  return flags.get();
}

export function useDeveloperFlags(): DeveloperFlags {
  return useValue(flags);
}

export function useDeveloperFlag(id: DeveloperFlagId): boolean {
  return useSelected(flags, (current) => current[id]);
}

export function watchDeveloperFlags(listener: () => void): () => void {
  watchers.add(listener);
  return (): void => {
    watchers.delete(listener);
  };
}

function isFlagId(value: string): value is DeveloperFlagId {
  return Object.hasOwn(allOff(), value);
}

function sameFlags(left: DeveloperFlags, right: DeveloperFlags): boolean {
  const ids = Object.keys(left).filter(isFlagId);
  const rightIds = Object.keys(right).filter(isFlagId);
  return ids.length === rightIds.length && ids.every((id) => right[id] === left[id]);
}

export function activateFlags(next: DeveloperFlags): void {
  if (sameFlags(flags.get(), next)) {
    return;
  }
  flags.set({ ...next });
  watchers.forEach((listener) => {
    listener();
  });
}
