import type { RunProgram } from '../../../src/node/run-program';
import type { ProgramProbe } from '../../../src/node/controls/linux/program-probe';
import type { LineStream, LineSubscriber } from '../../../src/node/controls/linux/line-stream';
import type { Schedule } from '../../../src/node/controls/linux/display-revert';
import { ProgramFailedError } from '../../../src/node/run-program';

export type Answer = string | Error | ((args: readonly string[]) => string);

export interface Recorder {
  readonly run: RunProgram;
  readonly calls: string[];
}

export function recorder(answers: Readonly<Record<string, Answer>>): Recorder {
  const calls: string[] = [];
  const run: RunProgram = (file, args) => {
    const line = [file, ...args].join(' ');
    calls.push(line);
    const key = Object.keys(answers)
      .toSorted((left, right) => right.length - left.length)
      .find((candidate) => line.startsWith(candidate));
    const answer = key === undefined ? undefined : answers[key];
    if (answer === undefined) {
      return Promise.reject(new ProgramFailedError(file, `unscripted call: ${line}`));
    }
    if (answer instanceof Error) {
      return Promise.reject(answer);
    }
    return Promise.resolve(typeof answer === 'function' ? answer(args) : answer);
  };
  return { run, calls };
}

export function installed(...programs: string[]): ProgramProbe {
  return (program) => Promise.resolve(programs.includes(program));
}

export interface FakeLines {
  readonly subscriber: LineSubscriber;
  readonly started: LineStream[];
  readonly stopped: LineStream[];
  readonly emit: (line: string) => void;
}

export function fakeLines(): FakeLines {
  const started: LineStream[] = [];
  const stopped: LineStream[] = [];
  return {
    started,
    stopped,
    subscriber: (stream) => {
      started.push(stream);
      return (): void => {
        stopped.push(stream);
      };
    },
    emit: (line): void => {
      started
        .filter((stream) => !stopped.includes(stream))
        .forEach((stream) => {
          stream.onLine(line);
        });
    },
  };
}

export interface ManualSchedule {
  readonly schedule: Schedule;
  readonly pending: () => number;
  readonly advance: () => void;
  readonly delays: number[];
}

export function manualSchedule(): ManualSchedule {
  const queue = new Map<number, () => void>();
  const delays: number[] = [];
  let next = 0;
  return {
    delays,
    schedule: (run, delayMs) => {
      const id = next++;
      delays.push(delayMs);
      queue.set(id, run);
      return (): void => {
        queue.delete(id);
      };
    },
    pending: () => queue.size,
    advance: (): void => {
      const due = [...queue];
      queue.clear();
      due.forEach(([, run]) => {
        run();
      });
    },
  };
}

export async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve();
  }
}
