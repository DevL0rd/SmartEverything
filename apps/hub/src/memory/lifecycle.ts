import type { Clock } from '../clock';
import type { ServerContext } from '../server/context';
import { ownerProfileOf } from '../transcripts/owner';
import { hubMemoryOf } from './hub-memory';
import { MemoryLearner } from './learner';
import { Principals } from './principals';
import { MemoryReview } from './review';
import { MemoryUpkeep } from './upkeep';

export interface RunningMemoryLearning {
  readonly learner: MemoryLearner;
  readonly stop: () => void;
}

export function startMemoryLearning(
  context: Pick<ServerContext, 'store' | 'openRouter'>,
  clock: Pick<Clock, 'now' | 'at'>,
): RunningMemoryLearning {
  const { store } = context;
  const { service, manager, model } = hubMemoryOf(context);
  const zone = (): string => store.settings.read().time_zone;
  const principals = new Principals(store, () => ownerProfileOf(store));
  const review = new MemoryReview({
    store,
    model,
    writer: service.writer,
    principals,
    clock,
    zone,
  });
  const upkeep = new MemoryUpkeep({
    store,
    manager,
    review,
    principals,
    clock,
    zone,
  });
  upkeep.start();
  return {
    learner: new MemoryLearner({ store, memory: service, manager }),
    stop: (): void => {
      upkeep.stop();
    },
  };
}
