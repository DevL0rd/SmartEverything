import type { CommandRow, LiveChange } from '@smarteverything/domain';
import type { LiveNotice } from './notice-registry';

export interface LiveSyncHooks {
  readonly onSnapshotCommands?: (commands: readonly CommandRow[]) => void;
  readonly onChanges: (changes: readonly LiveChange[]) => void;
  readonly onProfileChanged: () => void;
  readonly onSynchronized?: (replayed: readonly LiveChange[]) => void;
  readonly onNotice?: (message: LiveNotice, live: boolean) => boolean;
}
