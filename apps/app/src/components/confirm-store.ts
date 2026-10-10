import { ValueStore } from '../design/external-store';

export interface ConfirmRequest {
  readonly title: string;
  readonly body?: string;
  readonly confirmLabel: string;
  readonly tone?: 'default' | 'destructive';
  readonly typed?: string;
}

export interface PendingConfirm extends ConfirmRequest {
  readonly resolve: (accepted: boolean) => void;
}

export const pendingConfirm = new ValueStore<PendingConfirm | null>(null);

export function confirm(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    pendingConfirm.get()?.resolve(false);
    pendingConfirm.set({ ...request, resolve });
  });
}

export function settleConfirm(accepted: boolean): void {
  const pending = pendingConfirm.get();
  pendingConfirm.set(null);
  pending?.resolve(accepted);
}
