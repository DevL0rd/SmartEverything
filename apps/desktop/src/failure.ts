import { Logger } from '@smarteverything/logging';
import { dialog, type BrowserWindow } from 'electron';
import type { DeepLinkRefusal } from './deep-link-inbox.js';

const log = new Logger('desktop.main');

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error);
}

export function reportFailure(title: string, error: unknown): void {
  log.error('desktop.failed', error, { title });
  dialog.showErrorBox(title, describe(error));
}

export function refuseDeepLink(refusal: DeepLinkRefusal): void {
  log.warn('deep_link.refused', { reason: refusal.reason });
  dialog.showErrorBox('Link not opened', `${refusal.reason}; received ${refusal.received}`);
}

export function reportInterfaceFailure(_window: BrowserWindow, error: unknown): void {
  reportFailure('SmartEverything could not load its interface', error);
}
