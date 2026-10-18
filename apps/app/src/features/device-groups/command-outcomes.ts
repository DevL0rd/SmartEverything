import {
  commandOutcome,
  isFinished,
  type CommandRow,
  type MemberOutcome,
} from '@smarteverything/domain';
import type { EntityStore } from '../../store/entity-store';
import { commandSucceeded } from '../../store/live-commands';

async function settled(store: EntityStore, row: CommandRow): Promise<MemberOutcome | null> {
  const succeeded = await commandSucceeded(store, row);
  const current = store.get().tables.commands.byId[row.id];
  const finished = current !== undefined && isFinished(current.status) ? current : null;
  return commandOutcome({
    device_id: row.device_id,
    status: succeeded ? 'succeeded' : (finished?.status ?? 'expired'),
    error: finished?.error ?? null,
  });
}

export async function settledOutcomes(
  store: EntityStore,
  rows: readonly CommandRow[],
): Promise<readonly MemberOutcome[]> {
  const outcomes = await Promise.all(rows.map((row) => settled(store, row)));
  return outcomes.flatMap((outcome) => (outcome === null ? [] : [outcome]));
}
