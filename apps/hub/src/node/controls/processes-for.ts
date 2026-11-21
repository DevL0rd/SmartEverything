import { userInfo } from 'node:os';
import { describeFailure, type Logger } from '@smarteverything/logging';
import { windowsShell } from '../collectors/windows/powershell-session';
import { runProgram } from '../run-program';
import type { ProcessControl } from './controls';
import { DarwinProcessSource } from './darwin/darwin-processes';
import { LinuxProcesses } from './linux/linux-processes';
import { NodeFailureError } from '../node-failure';
import { PortableProcesses } from './portable/portable-processes';
import { WindowsProcessSource } from './windows/windows-processes';

function failedPart(log: Logger): (cause: unknown) => void {
  return (cause) => {
    log.warn('node.session_part_failed', {
      part: 'processes',
      failure: describeFailure(cause),
    });
  };
}

const PROCESSES: Partial<Readonly<Record<NodeJS.Platform, (log: Logger) => ProcessControl>>> = {
  linux: () => new LinuxProcesses(),
  win32: (log) =>
    new PortableProcesses({
      machine: 'Windows',
      source: new WindowsProcessSource(windowsShell),
      signals: { end: 'SIGTERM', force: 'SIGKILL', stop: null, continue: null },
      ownUser: userInfo().username,
      ownPid: process.pid,
      now: Date.now,
      failed: failedPart(log),
    }),
  darwin: (log) =>
    new PortableProcesses({
      machine: 'macOS',
      source: new DarwinProcessSource(runProgram),
      signals: { end: 'SIGTERM', force: 'SIGKILL', stop: 'SIGSTOP', continue: 'SIGCONT' },
      ownUser: userInfo().username,
      ownPid: process.pid,
      now: Date.now,
      failed: failedPart(log),
    }),
};

export function processesFor(platform: NodeJS.Platform, log: Logger): ProcessControl {
  const create = PROCESSES[platform];
  if (create === undefined) {
    throw new NodeFailureError(
      'not_supported',
      `Program lists are not available on ${platform} yet.`,
    );
  }
  return create(log);
}
