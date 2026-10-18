import { ValueStore, useSelected } from '../../../design/external-store';

const chosen = new ValueStore<Readonly<Record<string, string>>>({});

export function useChosenPerson(deviceId: string): string | null {
  return useSelected(chosen, (all) => all[deviceId] ?? null);
}

export function choosePerson(deviceId: string, profileId: string): void {
  chosen.update((all) => ({ ...all, [deviceId]: profileId }));
}
