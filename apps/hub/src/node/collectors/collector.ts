import type { HistoryPolicy, NodeHello } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { runProgram } from '../run-program';
import { DarwinReadings } from './darwin/darwin-readings';
import { LinuxComputer } from './linux/linux-computer';
import { PortableComputer } from './portable/portable-computer';
import type { SampleReaders } from './sampler';
import { windowsShell } from './windows/powershell-session';
import { WindowsReadings } from './windows/windows-readings';

export type CollectorReaders = Omit<SampleReaders, 'processes'>;

export interface ComputerCollector {
  readonly hello: (now: Date) => NodeHello | Promise<NodeHello>;
  readonly readers: CollectorReaders;
  readonly track: (policy: HistoryPolicy | null) => void;
  readonly stop: () => void;
}

export class UnsupportedPlatformError extends Error {
  override readonly name = 'UnsupportedPlatformError';

  constructor(platform: string) {
    super(`Computer readings are not available on ${platform} yet.`);
  }
}

export interface CollectorOptions {
  readonly log: Logger;
  readonly machineId: string;
  readonly now: () => number;
}

const COLLECTORS: Partial<
  Readonly<Record<NodeJS.Platform, (options: CollectorOptions) => ComputerCollector>>
> = {
  linux: ({ log }) => new LinuxComputer(log),
  win32: ({ machineId, now }) =>
    new PortableComputer({
      machineId,
      platform: 'win32',
      readings: new WindowsReadings(windowsShell),
      now,
    }),
  darwin: ({ machineId, now }) =>
    new PortableComputer({
      machineId,
      platform: 'darwin',
      readings: new DarwinReadings(runProgram),
      now,
    }),
};

export function collectorFor(
  platform: NodeJS.Platform,
  options: CollectorOptions,
): ComputerCollector {
  const create = COLLECTORS[platform];
  if (create === undefined) {
    throw new UnsupportedPlatformError(platform);
  }
  return create(options);
}
