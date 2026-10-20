import type { ListeningSource, ListeningView } from '@smarteverything/domain';

export interface EarHostOption {
  readonly value: string;
  readonly label: string;
}

export const AUTOMATIC_EAR_HOST = 'automatic';

const AUTOMATIC_OPTION: EarHostOption = { value: AUTOMATIC_EAR_HOST, label: 'Automatic' };

function computersOf(view: ListeningView): readonly ListeningSource[] {
  return view.sources.filter((source) => source.kind === 'computer');
}

export function earHostOptions(view: ListeningView): readonly EarHostOption[] {
  return [
    AUTOMATIC_OPTION,
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
    return 'Automatic: the first online computer that can listen does it.';
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
