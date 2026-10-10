import { useEffect, useRef, useState } from 'react';
import type { IrCodeRow, IrRemoteRow } from '@smarteverything/domain';
import { saveIrCode } from '../../../api/ir';
import { useRow } from '../../../store/selectors';
import { useLedger } from '../../../store/store-context';
import type { Device } from '../../../store/state';
import { learnOutcome, type LearnOutcome } from './ir-links';
import { rawErrorText } from '../../../format/errors';

interface Listening {
  readonly kind: 'listening';
  readonly commandId: string;
  readonly remote: IrRemoteRow;
  readonly button: string;
}

type Asked =
  | { readonly kind: 'idle' }
  | Listening
  | { readonly kind: 'saved'; readonly code: IrCodeRow }
  | { readonly kind: 'failed'; readonly message: string };

type LearnPhase = Asked | { readonly kind: 'saving'; readonly button: string };

export interface IrLearning {
  readonly phase: LearnPhase;
  readonly start: (remote: IrRemoteRow, button: string) => void;
  readonly reset: () => void;
}

function phaseOf(asked: Asked, outcome: LearnOutcome): LearnPhase {
  if (asked.kind !== 'listening') {
    return asked;
  }
  switch (outcome.kind) {
    case 'waiting':
      return asked;
    case 'failed':
      return { kind: 'failed', message: outcome.message };
    case 'learned':
      return { kind: 'saving', button: asked.button };
  }
}

function useSaveLearned(asked: Asked, outcome: LearnOutcome, settle: (asked: Asked) => void): void {
  const saving = useRef<string | null>(null);
  useEffect(() => {
    if (asked.kind !== 'listening' || outcome.kind !== 'learned') {
      return;
    }
    if (saving.current === asked.commandId) {
      return;
    }
    saving.current = asked.commandId;
    saveIrCode({
      remoteId: asked.remote.id,
      button: asked.button,
      format: outcome.code.format,
      code: outcome.code.code,
    }).then(
      (code) => {
        settle({ kind: 'saved', code });
      },
      (error: unknown) => {
        settle({ kind: 'failed', message: rawErrorText(error) });
      },
    );
  }, [asked, outcome, settle]);
}

export function useIrLearning(blaster: Device): IrLearning {
  const ledger = useLedger();
  const [asked, setAsked] = useState<Asked>({ kind: 'idle' });
  const command = useRow('commands', asked.kind === 'listening' ? asked.commandId : null);
  const outcome = learnOutcome(command ?? undefined);
  useSaveLearned(asked, outcome, setAsked);
  return {
    phase: phaseOf(asked, outcome),
    start: (remote, button): void => {
      ledger.send(blaster, 'ir_learn', null).then(
        (sent) => {
          setAsked(
            sent.sent
              ? { kind: 'listening', commandId: sent.row.id, remote, button }
              : { kind: 'failed', message: sent.message },
          );
        },
        (error: unknown) => {
          setAsked({ kind: 'failed', message: rawErrorText(error) });
        },
      );
    },
    reset: (): void => {
      setAsked({ kind: 'idle' });
    },
  };
}
