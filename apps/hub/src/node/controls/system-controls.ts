import type {
  ComputerFeature,
  DownloadChunk,
  DownloadPlan,
  FilePlaces,
  FileProperties,
  FileSearchQuery,
  FileSearchResult,
  FileUploadChunk,
  FileUploadResult,
  FileWriteChange,
  FileWriteResult,
  ProcessDetail,
  ServiceChange,
  ServicesState,
  StartupChange,
  StartupState,
  SystemChange,
  SystemState,
} from '@smarteverything/domain';

export interface SystemSettingsControl {
  readonly state: () => Promise<SystemState>;
  readonly apply: (change: SystemChange) => Promise<void>;
}

interface StartupControl {
  readonly list: () => Promise<StartupState>;
  readonly set: (change: StartupChange) => Promise<void>;
}

interface ServiceControl {
  readonly list: () => Promise<ServicesState>;
  readonly set: (change: ServiceChange) => Promise<void>;
}

interface ProcessDetailControl {
  readonly detail: (pid: number) => Promise<ProcessDetail>;
  readonly prioritise: (pid: number, nice: number) => Promise<void>;
}

export interface FileWriteControl {
  readonly search: (query: FileSearchQuery) => Promise<FileSearchResult>;
  readonly properties: (path: string) => Promise<FileProperties>;
  readonly write: (change: FileWriteChange) => Promise<FileWriteResult>;
  readonly upload: (chunk: FileUploadChunk) => Promise<FileUploadResult>;
  readonly places: () => Promise<FilePlaces>;
  readonly openDownload: (paths: readonly string[]) => Promise<DownloadPlan>;
  readonly readDownload: (id: string, length: number) => Promise<DownloadChunk>;
  readonly closeDownload: (id: string) => Promise<void>;
}

export interface SystemControls {
  readonly settings: SystemSettingsControl;
  readonly startup: StartupControl;
  readonly services: ServiceControl;
  readonly processes: ProcessDetailControl;
  readonly files: FileWriteControl;
  readonly features: () => Promise<readonly ComputerFeature[]>;
}
