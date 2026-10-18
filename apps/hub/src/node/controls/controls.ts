import type {
  ComputerFeature,
  ConnectLink,
  NodeHello,
  PowerAction,
  ProcessList,
  ProcessQuery,
  ProcessSignal,
  ProcessWindow,
  ProcessesUpdate,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Tick } from '../collectors/tick';
import { NodeFailureError } from '../node-failure';
import { darwinControls } from './darwin/darwin-controls';
import { linuxControls } from './linux/linux-controls';
import type {
  AppControl,
  AudioControl,
  CaptureControl,
  DisplayControl,
  FileControl,
  MachineControl,
  SessionControl,
  WindowControl,
} from './session-controls';
import type { SystemControls } from './system-controls';
import { windowsControls } from './windows/windows-controls';

export interface PowerControl {
  readonly available: () => Promise<PowerAction[]>;
  readonly run: (action: PowerAction) => Promise<void>;
}

export interface ProcessControl {
  readonly list: (query: ProcessQuery) => Promise<ProcessList>;
  readonly signal: (pid: number, signal: ProcessSignal) => void;
  readonly watch: (window: ProcessWindow | null) => void;
  readonly read: (tick: Tick) => ProcessesUpdate | null;
  readonly stop: () => void;
}

export interface ComputerControls {
  readonly power: PowerControl;
  readonly processes: ProcessControl;
  readonly links: (hello: NodeHello) => ConnectLink[];
  readonly session: SessionControl;
  readonly audio: AudioControl;
  readonly displays: DisplayControl;
  readonly windows: WindowControl;
  readonly system: SystemControls;
  readonly apps: AppControl;
  readonly files: FileControl;
  readonly capture: CaptureControl;
  readonly machine: MachineControl;
}

export interface ControlOptions {
  readonly now: () => Date;
  readonly log: Logger;
}

const CONTROLS: Partial<
  Readonly<Record<NodeJS.Platform, (options: ControlOptions) => ComputerControls>>
> = {
  linux: linuxControls,
  win32: windowsControls,
  darwin: darwinControls,
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

export async function controlFeatures(
  controls: ComputerControls,
  log: Logger,
): Promise<readonly ComputerFeature[]> {
  const sources = [
    ['audio', controls.audio],
    ['displays', controls.displays],
    ['windows', controls.windows],
    ['system', controls.system],
  ] as const;
  const found = await Promise.all(
    sources.map(async ([area, control]) => {
      try {
        return await control.features();
      } catch (cause) {
        log.error('node.features_failed', cause, { area });
        return [];
      }
    }),
  );
  return found.flat();
}
