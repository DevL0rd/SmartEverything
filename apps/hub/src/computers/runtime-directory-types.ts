import type { ComputerRuntimeTarget, ComputerRuntimeCapabilities } from '@smarteverything/domain';
import type { ComputerRuntimeHost, ComputerRuntimeHostEvent } from './runtime-host';
export interface AttachedRuntime {
  readonly host: ComputerRuntimeHost;
  readonly connectionGeneration: string;
  readonly local: boolean;
  capabilities: ComputerRuntimeCapabilities | null;
  leave: () => void;
}
export interface RuntimeJob {
  readonly target: ComputerRuntimeTarget;
  readonly chatId: string;
  readonly profileId: string;
  readonly source: AttachedRuntime;
  seq: number;
  processGeneration: string | null;
}
export interface ComputerRuntimeDirectoryEvent {
  readonly target: ComputerRuntimeTarget;
  readonly profileId?: string;
  readonly event: ComputerRuntimeHostEvent;
}
