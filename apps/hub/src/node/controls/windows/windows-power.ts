import type { PowerAction } from '@smarteverything/domain';
import type { RunProgram } from '../../run-program';
import type { PowerControl } from '../controls';

type Command = readonly [string, readonly string[]];

const COMMANDS: Readonly<Record<PowerAction, Command>> = {
  shut_down: ['shutdown.exe', ['/s', '/t', '0']],
  restart: ['shutdown.exe', ['/r', '/t', '0']],
  sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']],
  hibernate: ['shutdown.exe', ['/h']],
  lock_screen: ['rundll32.exe', ['user32.dll,LockWorkStation']],
  sign_out: ['shutdown.exe', ['/l']],
};

export class WindowsPower implements PowerControl {
  constructor(private readonly program: RunProgram) {}

  available(): Promise<PowerAction[]> {
    return Promise.resolve([
      'shut_down',
      'restart',
      'sleep',
      'hibernate',
      'lock_screen',
      'sign_out',
    ]);
  }

  async run(action: PowerAction): Promise<void> {
    const [file, args] = COMMANDS[action];
    await this.program(file, args);
  }
}
