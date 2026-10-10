import type { CallSource } from '@smarteverything/domain';

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

export interface CallEngine {
  readonly supported: () => string | null;
  readonly start: (request: CallRequest) => void;
  readonly end: () => void;
  readonly mute: (muted: boolean) => void;
  readonly allowMicrophone: () => Promise<boolean>;
  readonly inputLevel: () => number;
  readonly outputLevel: () => number;
}
