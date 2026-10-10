import { Logger } from '@smarteverything/logging';
import { dialog } from 'electron';

const log = new Logger('desktop.main');

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error);
}

export function reportFailure(title: string, error: unknown): void {
  log.error('desktop.failed', error, { title });
  dialog.showErrorBox(title, describe(error));
}
