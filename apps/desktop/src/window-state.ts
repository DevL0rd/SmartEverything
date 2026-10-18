import { readFileSync, writeFileSync } from 'node:fs';
import { Logger } from '@smarteverything/logging';
import { windowStateSchema, type WindowState } from './window-bounds.js';

export const WINDOW_STATE_FILE = 'window-state.json';

const log = new Logger('desktop.window');

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function readWindowState(file: string): WindowState | undefined {
  try {
    return windowStateSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch (error: unknown) {
    if (!isMissingFile(error)) {
      log.warn('window.state_unreadable', { file, reason: String(error) });
    }
    return undefined;
  }
}

export function writeWindowState(file: string, state: WindowState): void {
  writeFileSync(file, JSON.stringify(state), 'utf8');
}
