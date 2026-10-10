import { isFinished, type CommandRow } from '@smarteverything/domain';
import type { Clock } from '../../clock';
import type { ChangeFeed } from '../../store/feed';

export const COMMAND_WAIT_MS = 20_000;

export interface Outcome {
  readonly commands: readonly CommandRow[];
  readonly allFinished: boolean;
}

export interface WaitOptions {
  readonly feed: ChangeFeed;
  readonly clock: Clock;
  readonly waitMs: number;
  readonly submit: () => Promise<readonly CommandRow[]>;
  readonly current: (id: string) => CommandRow;
}

export async function submitAndWait(options: WaitOptions): Promise<Outcome> {
  const unfinished = new Set<string>();
  let settle: () => void = () => undefined;
  const unsubscribe = options.feed.subscribe((change) => {
    if (change.table !== 'commands' || change.record === null) {
      return;
    }
    if (isFinished(change.record.status) && unfinished.delete(change.record.id)) {
      if (unfinished.size === 0) {
        settle();
      }
    }
  });
  let ids: readonly string[];
  try {
    ids = (await options.submit()).map((row) => row.id);
  } catch (cause) {
    unsubscribe();
    throw cause;
  }
  for (const id of ids) {
    if (!isFinished(options.current(id).status)) {
      unfinished.add(id);
    }
  }
  return new Promise((resolve) => {
    let cancel: () => void = () => undefined;
    settle = (): void => {
      cancel();
      unsubscribe();
      resolve({
        commands: ids.map((id) => options.current(id)),
        allFinished: unfinished.size === 0,
      });
    };
    if (unfinished.size === 0) {
      settle();
      return;
    }
    cancel = options.clock.at(new Date(options.clock.now().getTime() + options.waitMs), settle);
  });
}
