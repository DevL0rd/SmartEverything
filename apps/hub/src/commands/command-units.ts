import type { CommandRow, CommandStatus } from '@smarteverything/domain';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { NewCommand } from '../store/repositories/commands';
import { storeUnit } from '../store/host/unit';

export interface OwnedCommands {
  readonly commands: readonly NewCommand[];
  readonly ownerRunId: string | null;
  readonly authority: ConversationAuthority | null;
}

export const INSERT_COMMANDS_UNIT = storeUnit(
  (store, { commands, ownerRunId, authority }: OwnedCommands): CommandRow[] => {
    const rows = store.commands.insert(commands);
    if (authority !== null)
      for (const row of rows) store.harnessRecovery.effects.keep('command', row.id, authority);
    if (ownerRunId !== null) store.automationRuns.retainCommands(ownerRunId, rows);
    return rows;
  },
);

export const CLAIM_COMMAND_UNIT = storeUnit(
  (store, { id, from }: { readonly id: string; readonly from: CommandStatus }): boolean => {
    if (!store.commands.claim(id, from)) return false;
    if (store.automationRuns.canDispatch(id)) return true;
    store.commands.finish(id, {
      status: 'failed',
      error: 'The owning automation run was cancelled before command dispatch.',
    });
    return false;
  },
);
