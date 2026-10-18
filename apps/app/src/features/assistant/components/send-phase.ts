import { ValueStore, useSelected } from '../../../design/external-store';

export type SendPhase = 'armed' | 'sending';

const phases = new ValueStore<Readonly<Record<string, SendPhase>>>({});

export function useSendPhase(key: string): SendPhase | null {
  return useSelected(phases, (all) => all[key] ?? null);
}

export function setSendPhase(key: string, phase: SendPhase | null): void {
  phases.update((all) => {
    const rest = Object.fromEntries(Object.entries(all).filter(([name]) => name !== key));
    return phase === null ? rest : { ...rest, [key]: phase };
  });
}
