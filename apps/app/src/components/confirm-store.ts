import { Logger } from '@smarteverything/logging';
import { ValueStore } from '../design/external-store';
import type { ThemeName } from '../design/tokens';

const log = new Logger('app.confirm');

export interface ConfirmRequest {
  readonly title: string;
  readonly body?: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly tone?: 'default' | 'destructive';
  readonly typed?: string;
  readonly theme?: ThemeName;
}

export interface ChoiceRequest extends ConfirmRequest {
  readonly alternateLabel: string;
}

export type ConfirmOutcome = 'confirm' | 'alternate' | 'cancel';

export interface PendingConfirm extends ConfirmRequest {
  readonly id: number;
  readonly alternateLabel?: string;
  readonly resolve: (outcome: ConfirmOutcome) => void;
}

export const pendingConfirm = new ValueStore<PendingConfirm | null>(null);

let issued = 0;

function ask(request: ConfirmRequest | ChoiceRequest): Promise<ConfirmOutcome> {
  return new Promise((resolve) => {
    const replaced = pendingConfirm.get();
    replaced?.resolve('cancel');
    issued += 1;
    log.info('confirm.requested', {
      id: issued,
      tone: request.tone ?? 'default',
      typed: request.typed !== undefined,
      alternate: 'alternateLabel' in request,
      replacedId: replaced?.id ?? null,
    });
    pendingConfirm.set({ ...request, id: issued, resolve });
  });
}

export async function confirm(request: ConfirmRequest): Promise<boolean> {
  return (await ask(request)) === 'confirm';
}

export function choose(request: ChoiceRequest): Promise<ConfirmOutcome> {
  return ask(request);
}

function settle(outcome: ConfirmOutcome): void {
  const pending = pendingConfirm.get();
  log.info('confirm.settled', { id: pending?.id ?? null, outcome });
  pendingConfirm.set(null);
  pending?.resolve(outcome);
}

export function settleConfirm(accepted: boolean): void {
  settle(accepted ? 'confirm' : 'cancel');
}

export function settleAlternate(): void {
  settle('alternate');
}
