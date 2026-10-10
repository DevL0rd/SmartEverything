import type { ComputerSnapshot, NodeHello } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { LinuxComputer } from './linux/linux-computer';

export interface ComputerCollector {
  readonly hello: (now: Date) => NodeHello;
  readonly snapshot: (now: Date) => ComputerSnapshot;
  readonly pace: (intervalMs: number) => void;
  readonly stop: () => void;
}

export class UnsupportedPlatformError extends Error {
  override readonly name = 'UnsupportedPlatformError';

  constructor(platform: string) {
    super(`Computer readings are not available on ${platform} yet.`);
  }
}

const COLLECTORS: Partial<Readonly<Record<NodeJS.Platform, (log: Logger) => ComputerCollector>>> = {
  linux: (log) => new LinuxComputer(log),
};

export function collectorFor(platform: NodeJS.Platform, log: Logger): ComputerCollector {
  const create = COLLECTORS[platform];
  if (create === undefined) {
    throw new UnsupportedPlatformError(platform);
  }
  return create(log);
}
