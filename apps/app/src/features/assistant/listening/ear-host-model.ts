import type { ListeningSource, ListeningView } from '@smarteverything/domain';

export interface EarHostOption {
  readonly value: string;
  readonly label: string;
}

export const AUTOMATIC_EAR_HOST = 'automatic';

function computersOf(view: ListeningView): readonly ListeningSource[] {
  return view.sources.filter((source) => source.kind === 'computer');
}

function automaticOption(view: ListeningView): EarHostOption {
  const first = computersOf(view).find((source) => source.state !== 'offline');
  const resolved = first === undefined ? 'no computer online' : first.name;
  return { value: AUTOMATIC_EAR_HOST, label: `Automatic · ${resolved}` };
}

export function earHostOptions(view: ListeningView): readonly EarHostOption[] {
  return [
    automaticOption(view),
    ...computersOf(view).map((source) => ({
      value: source.key,
      label: source.state === 'offline' ? `${source.name} (offline)` : source.name,
    })),
  ];
}

export function earHostValue(hostId: string | null): string {
  return hostId ?? AUTOMATIC_EAR_HOST;
}

export function earHostOfValue(value: string): string | null {
  return value === AUTOMATIC_EAR_HOST ? null : value;
}

export function earHostHint(hostId: string | null, view: ListeningView): string {
  if (hostId === null) {
    return computersOf(view).some((source) => source.state !== 'offline')
      ? 'Automatic: the first online computer that can listen does it.'
      : 'Automatic: no computer is online, so cameras, walkie channels and Discord cannot be heard until one connects.';
  }
  const chosen = computersOf(view).find((source) => source.key === hostId);
  if (chosen === undefined) {
    return 'The chosen computer is not in your home any more, so cameras, walkie channels and Discord cannot be heard. Pick another one.';
  }
  if (chosen.state === 'offline') {
    return `${chosen.name} is offline, so cameras, walkie channels and Discord cannot be heard until it is back or you pick another computer.`;
  }
  return `${chosen.name} listens for cameras, walkie channels and Discord. Phones and computers always listen for themselves.`;
}
