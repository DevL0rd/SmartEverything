import { Logger, setBackgroundScope } from '@smarteverything/logging';
import { isNative } from '../design/platform';
import { rawErrorText } from '../format/errors';

const log = new Logger('app.crash-guard');
setBackgroundScope('app.background');

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

let booted = false;

export function markBooted(): void {
  booted = true;
}

function logUncaught(error: unknown, fatal: boolean): void {
  log.exception('error.uncaught', error, { fatal, booted });
}

function guardedHandler(previous: GlobalHandler): GlobalHandler {
  return (error, isFatal) => {
    logUncaught(error, isFatal === true);
    if (__DEV__ || !booted) {
      previous(error, isFatal);
    }
  };
}

function onRejected(reason: unknown): void {
  log.error(
    'promise.unhandled',
    reason instanceof Error ? reason : new Error(rawErrorText(reason)),
  );
}

function guardNative(): void {
  ErrorUtils.setGlobalHandler(guardedHandler(ErrorUtils.getGlobalHandler()));
  if (__DEV__) {
    return;
  }
  const hermes: unknown = Reflect.get(globalThis, 'HermesInternal');
  const enable: unknown =
    typeof hermes === 'object' && hermes !== null
      ? Reflect.get(hermes, 'enablePromiseRejectionTracker')
      : null;
  if (typeof enable === 'function') {
    Reflect.apply(enable, hermes, [
      {
        allRejections: true,
        onUnhandled: (_id: number, reason: unknown): void => {
          onRejected(reason);
        },
      },
    ]);
  } else {
    log.warn('guard.rejections_untracked', {
      reason: 'this JavaScript engine cannot track promise rejections',
    });
  }
}

function guardWeb(): void {
  window.addEventListener('error', (event) => {
    logUncaught(event.error ?? new Error(event.message), true);
  });
  window.addEventListener('unhandledrejection', (event) => {
    onRejected(event.reason);
  });
}

let installed = false;

export function installCrashGuard(): void {
  if (installed) {
    return;
  }
  installed = true;
  if (isNative()) {
    guardNative();
    return;
  }
  guardWeb();
}
