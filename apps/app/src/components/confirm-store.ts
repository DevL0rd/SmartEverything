import { Logger } from '@smarteverything/logging';
import { ValueStore } from '../design/external-store';

const log = new Logger('app.confirm');

export interface ConfirmRequest {
  readonly title: string;
  readonly body?: string;
  readonly confirmLabel: string;
  readonly tone?: 'default' | 'destructive';
  readonly typed?: string;
}

export interface PendingConfirm extends ConfirmRequest {
  readonly id: number;
  readonly resolve: (accepted: boolean) => void;
}

export const pendingConfirm = new ValueStore<PendingConfirm | null>(null);

let issued = 0;

export function confirm(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    const replaced = pendingConfirm.get();
    replaced?.resolve(false);
    issued += 1;
    log.info('confirm.requested', {
      id: issued,
      tone: request.tone ?? 'default',
      typed: request.typed !== undefined,
      replacedId: replaced?.id ?? null,
    });
    pendingConfirm.set({ ...request, id: issued, resolve });
  });
}

export function settleConfirm(accepted: boolean): void {
  const pending = pendingConfirm.get();
  log.info('confirm.settled', { id: pending?.id ?? null, accepted });
  pendingConfirm.set(null);
  pending?.resolve(accepted);
}
