import type {
  CaptureTarget,
  ComputerCapture,
  ComputerSessionState,
  FileContent,
  FileList,
  InstalledApp,
  MediaStatus,
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
  readonly list: (path: string | null) => Promise<FileList>;
  readonly read: (path: string) => Promise<FileContent>;
}

export interface CaptureControl {
  readonly capture: (target: CaptureTarget) => Promise<ComputerCapture>;
}
