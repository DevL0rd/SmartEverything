import { useEffect, useRef, useState } from 'react';
import { Logger } from '@smarteverything/logging';
import { useRow } from '../../../store/selectors';
import { useLedger } from '../../../store/store-context';
import type { Device } from '../../../store/state';
import { learnOutcome, type LearnedCode, type LearnOutcome } from './ir-links';
import { rawErrorText } from '../../../format/errors';

const log = new Logger('app.devices');

export interface LearnTarget {
  readonly id: string;
  readonly save: (button: string, code: LearnedCode) => Promise<void>;
}

interface Listening {
  readonly kind: 'listening';
  readonly commandId: string;
  readonly target: LearnTarget;
  readonly button: string;
}

export interface SavedButton {
  readonly button: string;
  readonly code: LearnedCode;
}

type Asked =
  | { readonly kind: 'idle' }
  | Listening
  | ({ readonly kind: 'saved' } & SavedButton)
  | { readonly kind: 'failed'; readonly message: string };

type LearnPhase = Asked | { readonly kind: 'saving'; readonly button: string };

export interface IrLearning {
  readonly phase: LearnPhase;
  readonly start: (target: LearnTarget, button: string) => void;
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
    const { target, button, commandId } = asked;
    target.save(button, outcome.code).then(
      () => {
        log.info('ir.code_saved', { targetId: target.id, commandId });
        settle({ kind: 'saved', button, code: outcome.code });
      },
      (error: unknown) => {
        log.error('ir.save_failed', error, { targetId: target.id, commandId });
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
    start: (target, button): void => {
      ledger.send(blaster, 'ir_learn', null).then(
        (sent) => {
          log.info(sent.sent ? 'ir.learn_started' : 'ir.learn_refused', {
            blasterId: blaster.id,
            targetId: target.id,
            ...(sent.sent ? { commandId: sent.row.id } : { reason: sent.message }),
          });
          setAsked(
            sent.sent
              ? { kind: 'listening', commandId: sent.row.id, target, button }
              : { kind: 'failed', message: sent.message },
          );
        },
        (error: unknown) => {
          log.error('ir.learn_failed', error, { blasterId: blaster.id, targetId: target.id });
          setAsked({ kind: 'failed', message: rawErrorText(error) });
        },
      );
    },
    reset: (): void => {
      log.debug('ir.learn_reset', { blasterId: blaster.id, was: asked.kind });
      setAsked({ kind: 'idle' });
    },
  };
}
