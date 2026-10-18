import { AppState } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import { ValueStore, useValue } from '../design/external-store';
import { dismissToast, notify, notifyFailure } from './toast-store';

const log = new Logger('app.deferred');

export interface DeferredAction {
  readonly key: string;
  readonly message: string;
  readonly failure: string;
  readonly commit: () => Promise<void> | void;
}

const hidden = new ValueStore<ReadonlySet<string>>(new Set());

const waiting = new Map<string, number>();

let watching = false;

function unhide(key: string): void {
  hidden.update((current) => new Set([...current].filter((known) => known !== key)));
}

async function settle(action: DeferredAction): Promise<void> {
  waiting.delete(action.key);
  const operation = log.operation('deferred.commit', { key: action.key });
  try {
    await action.commit();
    operation.succeeded();
  } catch (error) {
    operation.failed(error);
    notifyFailure(action.failure)(error);
  } finally {
    unhide(action.key);
  }
}

function flushDeferred(): void {
  for (const toastId of [...waiting.values()]) {
    dismissToast(toastId);
  }
}

function watchBackground(): void {
  if (watching) {
    return;
  }
  watching = true;
  AppState.addEventListener('change', (next) => {
    if (next !== 'active') {
      log.info('deferred.flushed', { waiting: waiting.size, appState: next });
      flushDeferred();
    }
  });
}

export function usePendingKeys(): ReadonlySet<string> {
  return useValue(hidden);
}

export function deferAction(action: DeferredAction): void {
  if (hidden.get().has(action.key)) {
    log.debug('deferred.skipped', { key: action.key, reason: 'already_pending' });
    return;
  }
  watchBackground();
  hidden.update((current) => new Set([...current, action.key]));
  const toastId = notify({
    message: action.message,
    undo: () => {
      log.info('deferred.undone', { key: action.key });
      waiting.delete(action.key);
      unhide(action.key);
    },
    onDismissed: () => {
      background(settle(action), 'deferred_action.settle_failed');
    },
  });
  waiting.set(action.key, toastId);
  log.info('deferred.queued', { key: action.key, toastId, waiting: waiting.size });
}
