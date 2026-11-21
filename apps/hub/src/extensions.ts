import type { HubLayout } from './data-layout';
import type { ComputerAiDirectory } from './computers/ai-directory';
import type { EarsRelay } from './computers/ears-relay';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from './extensions/push/commands';
import type { ReplyNotices } from './extensions/push/reply-notices';
import type { OpenCalls } from './assistant-voice/open-calls';
import type { RunningHub } from './hub';
import type { MachineApprovals } from './machines/approval';
import type { MediaLinks } from './server/media-links';
import type { SecretStore } from './secrets/store';
import type { RawRoute } from './server/http-server';
import type { ExtensionRouteTable } from './server/router';
import type { LiveHub } from './server/live';
import type { Operations } from './server/operations';
import type { ComputerNodeSockets } from './server/node-socket';
import type { ReleasePublications } from './self-update/release-publications';
import type { SessionPlacementSource } from './computers/placements-slot';
import type { CalendarReader } from './planner/ical/calendar-reader';
import type { Store } from './store/store';
import type { MediaNotes } from './transcripts/media-notes';

export interface ExtensionContext {
  readonly store: Store;
  readonly computerAi: ComputerAiDirectory;
  readonly computerEars: EarsRelay;
  readonly computerPlacements: SessionPlacementSource;
  readonly nodeSockets: ComputerNodeSockets;
  readonly hub: RunningHub;
  readonly secrets: SecretStore;
  readonly live: LiveHub;
  readonly pushCommands: PushCommandChannel;
  readonly replyNotices: ReplyNotices;
  readonly machineApprovals: MachineApprovals;
  readonly openCalls: OpenCalls;
  readonly mediaNotes: MediaNotes;
  readonly calendars: CalendarReader;
  readonly links: MediaLinks;
  readonly operations: Operations;
  readonly publications: ReleasePublications;
  readonly layout: HubLayout;
  readonly log: Logger;
}

export interface RunningExtension {
  readonly endpoints: ExtensionRouteTable;
  readonly routes: readonly RawRoute[];
  readonly stop: () => Promise<void>;
}

export type ServerExtension = (context: ExtensionContext) => Promise<RunningExtension>;
