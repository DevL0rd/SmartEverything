import { spawn } from 'node:child_process';
import { Logger } from '@smarteverything/logging';
import { app } from 'electron';
import { reportFailure } from './failure.js';
import { DEEP_LINK_SCHEME } from './origin.js';
import { shortcutArguments, updateExecutableOf, type SquirrelEvent } from './squirrel.js';
import { removeWindowsLoginItem } from './start-on-login.js';

const log = new Logger('desktop.squirrel');

class SquirrelUpdateFailedError extends Error {
  readonly received: string;

  constructor(command: string, received: string) {
    super(`Squirrel's ${command} must finish with exit code 0; received ${received}`);
    this.name = 'SquirrelUpdateFailedError';
    this.received = received;
  }
}

function runUpdate(event: SquirrelEvent, args: readonly string[]): void {
  const update = updateExecutableOf(process.execPath);
  const command = `${update} ${args.join(' ')}`;
  log.info('squirrel.update_spawning', { event, argumentCount: args.length });
  const child = spawn(update, args, { detached: true, stdio: 'ignore' });
  child.once('error', (error: Error) => {
    log.error('squirrel.update_failed', error, { event });
    reportFailure(`SmartEverything could not finish the ${event} step`, error);
    app.exit(1);
  });
  child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
    log.info('squirrel.update_closed', { event, code, signal });
    if (code !== 0) {
      const received = code === null ? `signal ${String(signal)}` : `exit code ${String(code)}`;
      reportFailure(
        `SmartEverything could not finish the ${event} step`,
        new SquirrelUpdateFailedError(command, received),
      );
      app.exit(1);
      return;
    }
    app.quit();
  });
}

export function handleSquirrelEvent(event: SquirrelEvent): void {
  log.info('squirrel.event_handling', { event });
  if (event === 'uninstall') {
    removeWindowsLoginItem();
    app.removeAsDefaultProtocolClient(DEEP_LINK_SCHEME);
  }
  const args = shortcutArguments(event);
  if (args === undefined) {
    log.debug('squirrel.no_shortcuts', { event });
    app.quit();
    return;
  }
  runUpdate(event, args);
}
