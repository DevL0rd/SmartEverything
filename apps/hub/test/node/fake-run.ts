import { ProgramFailedError, type RunProgram } from '../../src/node/run-program';

export type Reply = string | Error | ((args: readonly string[]) => string);

export interface FakeRun {
  readonly run: RunProgram;
  readonly calls: string[];
  readonly reply: (command: string, reply: Reply) => void;
}

export function fakeRun(initial: Readonly<Record<string, Reply>> = {}): FakeRun {
  const replies = new Map<string, Reply>(Object.entries(initial));
  const calls: string[] = [];
  const run: RunProgram = (file, args) => {
    const command = [file, ...args].join(' ');
    calls.push(command);
    const reply = replies.get(command);
    if (reply === undefined) {
      return Promise.reject(new ProgramFailedError(file, `no fake reply for: ${command}`));
    }
    if (reply instanceof Error) {
      return Promise.reject(reply);
    }
    return Promise.resolve(typeof reply === 'function' ? reply(args) : reply);
  };
  return {
    run,
    calls,
    reply: (command, reply): void => {
      replies.set(command, reply);
    },
  };
}
