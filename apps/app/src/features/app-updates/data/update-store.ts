import { useSyncExternalStore } from 'react';
import type { AppUpdateSummary } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { ValueStore } from '../../../design/external-store';
import {
  INITIAL_UPDATE_VIEW,
  type AppUpdateController,
  type AppUpdateView,
} from './update-controller';

const log = new Logger('app.app-updates');

export const activeUpdateController = new ValueStore<AppUpdateController | null>(null);

export interface AppUpdateActions {
  readonly check: () => Promise<void>;
  readonly download: (expectedOfferId: AppUpdateSummary['id']) => void;
  readonly retry: (expectedOfferId?: AppUpdateSummary['id']) => void;
  readonly restart: (expectedOfferId?: AppUpdateSummary['id'], restoreFocus?: () => void) => void;
}

function withController<Args extends readonly unknown[]>(
  action: string,
  run: (controller: AppUpdateController, ...args: Args) => void | Promise<void>,
): (...args: Args) => void {
  return (...args: Args): void => {
    const controller = activeUpdateController.get();
    if (controller === null) {
      log.warn('app_update.no_host', { action });
      return;
    }
    const result = run(controller, ...args);
    if (result !== undefined) background(result, 'app_update.action_failed', { action });
  };
}

async function checkForUpdate(): Promise<void> {
  const controller = activeUpdateController.get();
  if (controller === null) {
    log.warn('app_update.no_host', { action: 'check' });
    return;
  }
  await controller.check('button');
}

export const APP_UPDATE_ACTIONS: AppUpdateActions = {
  check: checkForUpdate,
  download: withController('download', (controller, expectedOfferId: AppUpdateSummary['id']) =>
    controller.download(expectedOfferId),
  ),
  retry: withController('retry', (controller, expectedOfferId?: AppUpdateSummary['id']) =>
    controller.retry(expectedOfferId),
  ),
  restart: withController(
    'restart',
    (controller, expectedOfferId?: AppUpdateSummary['id'], restoreFocus?: () => void): void => {
      controller.requestRestart(expectedOfferId, restoreFocus);
    },
  ),
};

function subscribeView(listener: () => void): () => void {
  let stopView = activeUpdateController.get()?.view.subscribe(listener);
  const stopController = activeUpdateController.subscribe(() => {
    stopView?.();
    stopView = activeUpdateController.get()?.view.subscribe(listener);
    listener();
  });
  return (): void => {
    stopController();
    stopView?.();
  };
}

function readView(): AppUpdateView {
  return activeUpdateController.get()?.view.get() ?? INITIAL_UPDATE_VIEW;
}

export function useAppUpdate(): AppUpdateView & { readonly actions: AppUpdateActions } {
  const view = useSyncExternalStore(subscribeView, readView, readView);
  return { ...view, actions: APP_UPDATE_ACTIONS };
}
