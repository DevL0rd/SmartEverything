import type { DeliveryEvents } from '../../src/assistant/delivery';
import type { Store } from '../../src/store/store';

export function mainDeliveryEvents(store: Pick<Store, 'assistantEvents'>): DeliveryEvents {
  return {
    pending: (): Promise<ReturnType<Store['assistantEvents']['pending']>> =>
      Promise.resolve(store.assistantEvents.pending()),
    mark: (id, column): Promise<void> => {
      store.assistantEvents.mark(id, column);
      return Promise.resolve();
    },
  };
}
