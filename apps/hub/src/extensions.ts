import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from './extensions/push/commands';
import type { OpenCalls } from './assistant-voice/open-calls';
import type { RunningHub } from './hub';
import type { SecretStore } from './secrets/store';
import type { RawRoute } from './server/http-server';
import type { ExtensionRouteTable } from './server/router';
import type { LiveHub } from './server/live';
import type { Operations } from './server/operations';
import type { Store } from './store/store';
import type { MediaNotes } from './transcripts/media-notes';

export interface ExtensionContext {
  readonly store: Store;
  readonly hub: RunningHub;
  readonly secrets: SecretStore;
  readonly live: LiveHub;
  readonly pushCommands: PushCommandChannel;
  readonly openCalls: OpenCalls;
  readonly mediaNotes: MediaNotes;
  readonly operations: Operations;
  readonly dataDirectory: string;
  readonly log: Logger;
}

export interface RunningExtension {
  readonly endpoints: ExtensionRouteTable;
  readonly routes: readonly RawRoute[];
  readonly stop: () => Promise<void>;
}

export type ServerExtension = (context: ExtensionContext) => Promise<RunningExtension>;
