import { DisplayRevert } from '../../../src/node/controls/linux/display-revert';
import {
  LinuxDisplays,
  type DisplayEnvironment,
} from '../../../src/node/controls/linux/linux-displays';
import { KwinNightLight } from '../../../src/node/controls/linux/night-light';
import type { NoticeAnswer, RevertNotice } from '../../../src/node/controls/linux/revert-notice';
import type { RunProgram } from '../../../src/node/run-program';
import { ProgramFailedError } from '../../../src/node/run-program';
import { kscreen, type FixtureOutput } from './kscreen-fixtures';
import { fakeLines, installed, manualSchedule } from './support';

const KDE: DisplayEnvironment = { kde: true, wayland: true, x11: false };

interface Notice {
  summary: string;
  seconds: number;
  closed: boolean;
  answer: (a: NoticeAnswer) => void;
}

export interface Rig {
  readonly displays: LinuxDisplays;
  readonly calls: string[];
  readonly notices: Notice[];
  readonly clock: ReturnType<typeof manualSchedule>;
  readonly lines: ReturnType<typeof fakeLines>;
  readonly failures: unknown[];
  readonly layout: () => readonly FixtureOutput[];
}

interface RigOptions {
  programs?: string[];
  environment?: DisplayEnvironment;
  noticeFails?: boolean;
  applies?: boolean;
}

interface Layout {
  readonly read: () => readonly FixtureOutput[];
  readonly write: (outputs: readonly FixtureOutput[]) => void;
}

function changed(
  output: FixtureOutput,
  setting: string,
  value: string,
  applies: boolean,
): FixtureOutput {
  if (setting === 'enable' || setting === 'disable') {
    return { ...output, enabled: setting === 'enable' };
  }
  return setting === 'mode' && applies ? { ...output, mode: value } : output;
}

function kscreenRun(layout: Layout, calls: string[], applies: boolean): RunProgram {
  return (file, args) => {
    calls.push([file, ...args].join(' '));
    if (file !== 'kscreen-doctor') {
      return Promise.reject(new ProgramFailedError(file, 'not scripted'));
    }
    if (args[0] === '-j') {
      return Promise.resolve(kscreen(layout.read()));
    }
    for (const arg of args) {
      const [, name, setting, value] = /^output\.([^.]+)\.(\w+)\.?(.*)$/.exec(arg) ?? [];
      layout.write(
        layout
          .read()
          .map((output) =>
            output.name === name ? changed(output, setting ?? '', value ?? '1', applies) : output,
          ),
      );
    }
    return Promise.resolve('');
  };
}

function revertNotice(notices: Notice[], fails: boolean): RevertNotice {
  return {
    show: (summary, seconds, answer): Promise<() => Promise<void>> => {
      if (fails) {
        return Promise.reject(new Error('no notification service'));
      }
      const entry = { summary, seconds, closed: false, answer };
      notices.push(entry);
      return Promise.resolve(() => {
        entry.closed = true;
        return Promise.resolve();
      });
    },
  };
}

export function displayRig(initial: readonly FixtureOutput[], options: RigOptions = {}): Rig {
  let outputs: readonly FixtureOutput[] = [...initial];
  const layout: Layout = {
    read: () => outputs,
    write: (next): void => {
      outputs = next;
    },
  };
  const calls: string[] = [];
  const notices: Notice[] = [];
  const clock = manualSchedule();
  const lines = fakeLines();
  const failures: unknown[] = [];
  const run = kscreenRun(layout, calls, options.applies !== false);
  const unreachable = (): never => {
    throw new Error('no bus');
  };
  const displays = new LinuxDisplays({
    run,
    probe: installed(...(options.programs ?? ['kscreen-doctor', 'udevadm'])),
    lines: lines.subscriber,
    environment: (): DisplayEnvironment => options.environment ?? KDE,
    nightLight: new KwinNightLight(unreachable, run),
    notice: revertNotice(notices, options.noticeFails === true),
    revert: new DisplayRevert({
      now: (): Date => new Date('2026-10-17T10:00:00.000Z'),
      schedule: clock.schedule,
      token: (): string => 'token-1',
    }),
    schedule: clock.schedule,
    failed: (cause): void => {
      failures.push(cause);
    },
  });
  return { displays, calls, notices, clock, lines, failures, layout: layout.read };
}

export const BOTH: FixtureOutput[] = [
  { name: 'DP-3', enabled: true, hdr: false, vrrPolicy: 2, brightness: 0.8 },
  { name: 'eDP-2', enabled: true, type: 7, x: 2560, priority: 2 },
];

export const ONLY_DP: FixtureOutput[] = [
  { name: 'DP-3', enabled: true },
  { name: 'eDP-2', enabled: false, type: 7, x: 2560, priority: 2 },
];
