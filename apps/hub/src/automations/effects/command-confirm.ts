import {
  CAPABILITY_KEY,
  capabilityOf,
  type CommandRow,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Clock } from '../../clock';
import { commandBudgetMs } from '../../commands/command-budgets';
import { isConfirmedBy } from '../../commands/command-confirmations';
import { laneKey } from '../../commands/command-queue';
import type { Store } from '../../store/store';
import { AutomationRunCancelledError } from './run-abort';

export class CommandNotConfirmedError extends Error {
  override readonly name = 'CommandNotConfirmedError';

  constructor(readonly missing: readonly string[]) {
    super(`The device did not confirm the change in time: ${missing.join('; ')}.`);
  }
}

interface Expected {
  readonly key: string;
  readonly capability: string;
  readonly value: JsonValue;
  readonly budgetMs: number;
  readonly line: string;
}

export interface ConfirmWait {
  readonly store: Pick<Store, 'feed' | 'state' | 'devices'>;
  readonly clock: Pick<Clock, 'at'>;
  readonly rows: readonly CommandRow[];
  readonly sentAt: number;
  readonly run: { readonly runId: string; readonly signal: AbortSignal };
}

const SUPERSEDED = z.object({ superseded: z.literal(true) });

function replaced(row: CommandRow): boolean {
  return SUPERSEDED.safeParse(row.result).success;
}

function expectedOf(store: ConfirmWait['store'], row: CommandRow): Expected | undefined {
  if (row.device_id === null || replaced(row)) return undefined;
  const device = store.devices.find(row.device_id);
  const key = CAPABILITY_KEY.safeParse(row.capability);
  if (device === undefined || !key.success) return undefined;
  const descriptor = capabilityOf(device, key.data);
  if (descriptor?.access !== 'read_write' || descriptor.value.kind === 'action') return undefined;
  const current = store.state.value(row.device_id, row.capability);
  if (current !== undefined && isConfirmedBy(row.capability, row.value, current)) return undefined;
  return {
    key: laneKey(row.device_id, row.capability),
    capability: row.capability,
    value: row.value,
    budgetMs: commandBudgetMs({
      capability: row.capability,
      value: row.value,
      deviceKind: device.kind,
    }),
    line: `${device.name} ${row.capability}`,
  };
}

export function awaitConfirmations({
  store,
  clock,
  rows,
  sentAt,
  run,
}: ConfirmWait): Promise<void> {
  const waiting = new Map<string, Expected>();
  for (const row of rows) {
    const expected = expectedOf(store, row);
    if (expected !== undefined) waiting.set(expected.key, expected);
  }
  if (waiting.size === 0) return Promise.resolve();
  const deadline = Math.max(...[...waiting.values()].map((expected) => expected.budgetMs));
  return new Promise((resolve, reject) => {
    const finish = (error?: Error): void => {
      unsubscribe();
      cancel();
      run.signal.removeEventListener('abort', abort);
      if (error === undefined) resolve();
      else reject(error);
    };
    const abort = (): void => {
      finish(new AutomationRunCancelledError(run.runId));
    };
    const unsubscribe = store.feed.subscribe((change) => {
      if (change.table !== 'device_state' || change.record === null) return;
      const reported = change.record;
      const key = laneKey(reported.device_id, reported.capability);
      const expected = waiting.get(key);
      if (
        expected === undefined ||
        Date.parse(reported.observed_at) < sentAt ||
        !isConfirmedBy(expected.capability, expected.value, reported.value)
      )
        return;
      waiting.delete(key);
      if (waiting.size === 0) finish();
    });
    const cancel = clock.at(new Date(sentAt + deadline), () => {
      finish(new CommandNotConfirmedError([...waiting.values()].map((expected) => expected.line)));
    });
    run.signal.addEventListener('abort', abort, { once: true });
    if (run.signal.aborted) abort();
  });
}
