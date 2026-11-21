import type { DeliveryEvents } from '../../src/assistant/delivery';
import type { SeededStore } from './store';

export function mainDeliveryEvents(store: Pick<SeededStore, 'assistantEvents'>): DeliveryEvents {
  return {
    pending: (): Promise<ReturnType<SeededStore['assistantEvents']['pending']>> =>
      Promise.resolve(store.assistantEvents.pending()),
    mark: (id, column): Promise<void> => {
      store.assistantEvents.mark(id, column);
      return Promise.resolve();
    },
  };
}
