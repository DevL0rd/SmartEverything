import type {
  AudioChange,
  AudioState,
  CaptureTarget,
  ComputerFeature,
  ComputerCapture,
  ComputerSessionState,
  DisplayChange,
  DisplayState,
  FileContent,
  FileList,
  FileRange,
  InstalledApp,
  MachineActionSupport,
  MachineOpenTarget,
  MachinePermissionState,
  MediaStatus,
  WindowChange,
  WindowsState,
} from '@smarteverything/domain';

export interface SessionControl {
  readonly start: (onChange: (session: ComputerSessionState) => void) => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly setVolume: (level: number) => Promise<void>;
  readonly setMuted: (muted: boolean) => Promise<void>;
  readonly playback: (status: MediaStatus) => Promise<void>;
}

export interface AppControl {
  readonly installed: () => Promise<InstalledApp[]>;
  readonly open: (appId: string) => Promise<void>;
  readonly close: (appId: string, force: boolean) => Promise<number>;
}

export interface FileControl {
  readonly list: (path: string | null, cursor: number) => Promise<FileList>;
  readonly read: (path: string) => Promise<FileContent>;
  readonly range: (path: string, start: number, length: number) => Promise<FileRange>;
}

export interface CaptureControl {
  readonly capture: (target: CaptureTarget) => Promise<ComputerCapture>;
}

export interface MachineReport {
  readonly actions: readonly MachineActionSupport[];
  readonly permissions: readonly MachinePermissionState[];
}

export interface MachineControl {
  readonly report: () => Promise<MachineReport>;
  readonly watch: (onChange: () => void) => StopWatching;
  readonly ring: (on: boolean) => Promise<void>;
  readonly open: (target: MachineOpenTarget) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly showUnlock: () => Promise<void>;
}

export type StopWatching = () => void;

interface StateControl<State> {
  readonly features: () => Promise<readonly ComputerFeature[]>;
  readonly read: () => Promise<State>;
  readonly watch: (onChange: (state: State) => void) => StopWatching;
}

export interface AudioControl extends StateControl<AudioState> {
  readonly change: (change: AudioChange) => Promise<AudioState>;
}

export interface DisplayControl extends StateControl<DisplayState> {
  readonly change: (change: DisplayChange, revert: boolean) => Promise<DisplayState>;
  readonly confirm: (token: string, keep: boolean) => Promise<DisplayState>;
  readonly stop: () => Promise<void>;
}

export interface WindowControl extends StateControl<WindowsState> {
  readonly change: (change: WindowChange) => Promise<WindowsState>;
}
