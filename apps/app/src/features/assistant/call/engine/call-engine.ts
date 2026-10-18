import type {
  AppSightSource,
  CallAudio,
  CallSource,
  EchoTestOutcome,
  SightFacing,
  SightSource,
} from '@smarteverything/domain';

export interface CallConnection {
  readonly url: string;
  readonly token: string;
}

export interface CallRequest {
  readonly connection: CallConnection;
  readonly source: CallSource;
  readonly device: string;
  readonly chatId: string | null;
  readonly answering: string | null;
}

export interface EngineCapabilities {
  readonly sight: Readonly<Record<AppSightSource, string | null>>;
  readonly audio: string | null;
  readonly echoTest: string | null;
  readonly light: string | null;
}

export interface SightStart {
  readonly source: AppSightSource;
  readonly facing?: SightFacing;
  readonly target?: string;
}

export interface CallLevels {
  readonly in: number;
  readonly out: number;
}

export type CallLevelListener = (levels: CallLevels) => void;

interface LevelEvents {
  readonly kind: 'events';
  readonly subscribe: (listener: CallLevelListener) => () => void;
}

interface LevelPoll {
  readonly kind: 'poll';
  readonly read: () => CallLevels;
}

export type LevelFeed = LevelEvents | LevelPoll;

export interface CallEngine {
  readonly supported: () => string | null;
  readonly start: (request: CallRequest) => void;
  readonly end: () => void;
  readonly mute: (muted: boolean) => void;
  readonly allowMicrophone: () => Promise<boolean>;
  readonly levels: LevelFeed;
  readonly capabilities: () => EngineCapabilities;
  readonly applyAudio: (pref: CallAudio) => void;
  readonly startSight: (start: SightStart) => Promise<void>;
  readonly stopSight: (source: SightSource) => void;
  readonly switchCamera: () => Promise<void>;
  readonly pauseSight: (paused: boolean) => void;
  readonly setLight: (on: boolean) => void;
  readonly showThis: (start: SightStart) => Promise<void>;
  readonly watchCamera: (cameraId: string) => void;
  readonly answerRequest: (requestId: string, accepted: boolean) => void;
  readonly echoTest: () => Promise<EchoTestOutcome>;
  readonly interrupt: () => void;
}
