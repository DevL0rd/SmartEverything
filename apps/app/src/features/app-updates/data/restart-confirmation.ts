import { ValueStore } from '../../../design/external-store';

interface RestartConfirmation {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

type RestartSource = 'ui' | 'desktop';

interface PendingRestart {
  readonly request: RestartConfirmation;
  readonly source: RestartSource;
  readonly restoreFocus?: () => void;
  readonly resolve: (accepted: boolean) => void;
}

export const pendingRestart = new ValueStore<PendingRestart | null>(null);

export function askToRestart(
  request: RestartConfirmation,
  source: RestartSource = 'ui',
  restoreFocus?: () => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const pending = pendingRestart.get();
    if (pending !== null && (source === 'desktop' || pending.source === 'desktop')) {
      resolve(false);
      return;
    }
    pending?.resolve(false);
    pendingRestart.set({
      request,
      source,
      resolve,
      ...(restoreFocus === undefined ? {} : { restoreFocus }),
    });
  });
}

export function settleRestart(pending: PendingRestart | null, accepted: boolean): void {
  if (pending === null || pendingRestart.get() !== pending) return;
  pendingRestart.set(null);
  pending.resolve(accepted);
}
