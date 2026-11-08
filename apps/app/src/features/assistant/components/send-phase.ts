import { useEffect, useEffectEvent, useRef } from 'react';
import { Logger } from '@smarteverything/logging';
import { ValueStore, useSelected } from '../../../design/external-store';

export type SendPhase = 'armed' | 'sending';

const log = new Logger('app.composer');
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

export function beginSend(key: string): boolean {
  if (phases.get()[key] === 'sending') return false;
  setSendPhase(key, 'sending');
  return true;
}

function arm(key: string, pendingUploads: number): void {
  if (phases.get()[key] !== undefined) return;
  log.info('send.armed', { draftKey: key, pendingUploads });
  setSendPhase(key, 'armed');
}

export function useArmedSend(input: {
  readonly key: string;
  readonly targetKey: string;
  readonly armed: boolean;
  readonly allowed: boolean;
  readonly attachments: readonly string[] | null;
  readonly submit: (ready: readonly string[]) => void;
}): { readonly send: (count: number) => void; readonly cancel: () => void } {
  const { key, targetKey, armed, allowed, attachments, submit } = input;
  const armedFor = useRef<string | null>(null);
  const settle = useEffectEvent((): void => {
    if (phases.get()[key] !== 'armed') return;
    if (!allowed || armedFor.current !== targetKey) {
      log.warn('send.disarmed', { draftKey: key });
      setSendPhase(key, null);
    } else if (attachments !== null) submit(attachments);
  });
  useEffect(() => {
    if (armed) settle();
  }, [armed, attachments, allowed, targetKey]);
  useEffect(
    () => (): void => {
      if (phases.get()[key] === 'armed') setSendPhase(key, null);
    },
    [key],
  );
  return {
    send: (count): void => {
      if (attachments === null) {
        armedFor.current = targetKey;
        arm(key, count);
      } else submit(attachments);
    },
    cancel: (): void => {
      if (phases.get()[key] !== 'armed') return;
      log.info('send.cancelled', { draftKey: key });
      setSendPhase(key, null);
    },
  };
}
