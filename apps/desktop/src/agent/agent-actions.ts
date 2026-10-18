import type {
  CaptureTarget,
  ComputerCapture,
  DesktopStill,
  MachineOpenTarget,
} from '@smarteverything/domain';

export type AgentFailureCode = 'not_supported' | 'failed';

export class AgentFailure extends Error {
  override readonly name = 'AgentFailure';

  constructor(
    readonly code: AgentFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export interface AgentActions {
  readonly open: (target: MachineOpenTarget) => Promise<void>;
  readonly ring: (on: boolean, ended: () => void) => Promise<void>;
  readonly capture: (target: CaptureTarget) => Promise<ComputerCapture>;
}

interface ShellPort {
  readonly openExternal: (url: string) => Promise<void>;
  readonly openPath: (path: string) => Promise<string>;
}

export interface RingPort {
  readonly start: (ended: () => void) => void;
  readonly stop: () => void;
}

interface StillPort {
  readonly still: (sourceId: string | null) => Promise<DesktopStill>;
}

export interface ElectronActionsOptions {
  readonly shell: ShellPort;
  readonly ring: RingPort;
  readonly screen: StillPort;
  readonly now: () => Date;
}

export function electronAgentActions(options: ElectronActionsOptions): AgentActions {
  return {
    open: async (target): Promise<void> => {
      if (target.kind === 'url') {
        await options.shell.openExternal(target.url);
        return;
      }
      const failure = await options.shell.openPath(target.path);
      if (failure !== '') throw new AgentFailure('failed', failure);
    },
    ring: (on, ended): Promise<void> => {
      if (on) options.ring.start(ended);
      else options.ring.stop();
      return Promise.resolve();
    },
    capture: async (target): Promise<ComputerCapture> => {
      if (target === 'focused') {
        throw new AgentFailure('not_supported', 'The app can only capture the whole screen.');
      }
      const still = await options.screen.still(null);
      return {
        mimeType: 'image/jpeg',
        data: still.dataBase64,
        width: still.width,
        height: still.height,
        at: options.now().toISOString(),
      };
    },
  };
}
