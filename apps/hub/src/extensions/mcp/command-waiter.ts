import { isFinished, type CommandRow } from '@smarteverything/domain';
import type { Clock } from '../../clock';
import type { ChangeFeed } from '../../store/feed';

export interface Outcome {
  readonly commands: readonly CommandRow[];
  readonly allFinished: boolean;
}

export interface WaitOptions {
  readonly feed: ChangeFeed;
  readonly clock: Clock;
  readonly waitMs: number;
  readonly submit: () => Promise<readonly CommandRow[]>;
  readonly current: (id: string) => Promise<CommandRow>;
}

async function stillOpen(
  options: WaitOptions,
  ids: readonly string[],
  finished: ReadonlySet<string>,
): Promise<readonly string[]> {
  const rows = await Promise.all(ids.map((id) => options.current(id)));
  return rows
    .filter((row) => !isFinished(row.status) && !finished.has(row.id))
    .map((row) => row.id);
}

export async function submitAndWait(options: WaitOptions): Promise<Outcome> {
  const unfinished = new Set<string>();
  const finished = new Set<string>();
  let settle: () => void = () => undefined;
  const unsubscribe = options.feed.subscribe((change) => {
    if (change.table !== 'commands' || change.record === null) {
      return;
    }
    if (isFinished(change.record.status)) finished.add(change.record.id);
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
  try {
    for (const id of await stillOpen(options, ids, finished)) unfinished.add(id);
  } catch (cause) {
    unsubscribe();
    throw cause;
  }
  const done = await new Promise<boolean>((resolve) => {
    let cancel: () => void = () => undefined;
    settle = (): void => {
      cancel();
      unsubscribe();
      resolve(unfinished.size === 0);
    };
    if (unfinished.size === 0) {
      settle();
      return;
    }
    cancel = options.clock.at(new Date(options.clock.now().getTime() + options.waitMs), settle);
  });
  return {
    commands: await Promise.all(ids.map((id) => options.current(id))),
    allFinished: done,
  };
}
