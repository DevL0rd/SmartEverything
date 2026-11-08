import type { CommandRow, LiveChange, Snapshot } from '@smarteverything/domain';
import type { LiveNotice } from './notice-registry';

export interface LiveSyncHooks {
  readonly onSnapshotCommands?: (commands: readonly CommandRow[]) => void;
  readonly onChanges: (changes: readonly LiveChange[]) => void;
  readonly onProfileChanged: () => void;
  readonly onSynchronized?: (replayed: readonly LiveChange[], snapshot: Snapshot) => void;
  readonly onNotice?: (message: LiveNotice, live: boolean) => boolean;
}
