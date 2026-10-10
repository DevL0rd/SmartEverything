import type {
  ConnectLink,
  NodeHello,
  PowerAction,
  ProcessList,
  ProcessQuery,
  ProcessSignal,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { NodeFailureError } from '../node-failure';
import { linuxControls } from './linux/linux-controls';
import type { AppControl, CaptureControl, FileControl, SessionControl } from './session-controls';

export interface PowerControl {
  readonly available: () => Promise<PowerAction[]>;
  readonly run: (action: PowerAction) => Promise<void>;
}

export interface ProcessControl {
  readonly list: (query: ProcessQuery) => Promise<ProcessList>;
  readonly signal: (pid: number, signal: ProcessSignal) => void;
  readonly stop: () => void;
}

export interface ComputerControls {
  readonly power: PowerControl;
  readonly processes: ProcessControl;
  readonly links: (hello: NodeHello) => ConnectLink[];
  readonly session: SessionControl;
  readonly apps: AppControl;
  readonly files: FileControl;
  readonly capture: CaptureControl;
}

export interface ControlOptions {
  readonly now: () => Date;
  readonly log: Logger;
}

const CONTROLS: Partial<
  Readonly<Record<NodeJS.Platform, (options: ControlOptions) => ComputerControls>>
> = {
  linux: linuxControls,
};

export function controlsFor(platform: NodeJS.Platform, options: ControlOptions): ComputerControls {
  const create = CONTROLS[platform];
  if (create === undefined) {
    throw new NodeFailureError(
      'not_supported',
      `Computer controls are not available on ${platform} yet.`,
    );
  }
  return create(options);
}
