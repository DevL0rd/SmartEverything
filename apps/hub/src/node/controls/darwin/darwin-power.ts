import type { PowerAction } from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { PowerControl } from '../controls';

type Command = readonly [string, readonly string[]];

function systemEvents(verb: string): Command {
  return ['osascript', ['-e', `tell application "System Events" to ${verb}`]];
}

const COMMANDS: Readonly<Partial<Record<PowerAction, Command>>> = {
  shut_down: systemEvents('shut down'),
  restart: systemEvents('restart'),
  sleep: ['pmset', ['sleepnow']],
  lock_screen: ['pmset', ['displaysleepnow']],
  sign_out: systemEvents('log out'),
};

export class DarwinPower implements PowerControl {
  constructor(private readonly program: RunProgram) {}

  available(): Promise<PowerAction[]> {
    return Promise.resolve(['shut_down', 'restart', 'sleep', 'lock_screen', 'sign_out']);
  }

  async run(action: PowerAction): Promise<void> {
    const command = COMMANDS[action];
    if (command === undefined) {
      throw new NodeFailureError('not_supported', 'A Mac cannot hibernate from here.');
    }
    await this.program(command[0], command[1]);
  }
}
