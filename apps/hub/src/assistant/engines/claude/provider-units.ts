import type {
  AiChatProvider,
  AiChatRow,
  AiSubscriptionUsage,
  ProviderEvent,
} from '@smarteverything/domain';
import { storeUnit } from '../../../store/host/unit';
import { observeNativeSubscription } from '../../native-subscription';
import { updatedProvider } from './provider-update';

const STATE_EVENTS: ReadonlySet<ProviderEvent['kind']> = new Set([
  'accepted',
  'completed',
  'failed',
  'prompt',
  'dialog',
]);

export const CLAUDE_RECEIVE_UNIT = storeUnit(
  (store, input: { readonly chatId: string; readonly event: ProviderEvent }): boolean => {
    if (!store.aiProvider.append(input.chatId, input.event)) return false;
    if (STATE_EVENTS.has(input.event.kind)) {
      const state = store.aiProvider.read(input.chatId, false);
      if (state !== null) store.aiProvider.save(input.chatId, updatedProvider(state, input.event));
    }
    return true;
  },
);

export const CLAUDE_METADATA_SAVE_UNIT = storeUnit(
  (
    store,
    input: {
      readonly chat: AiChatRow;
      readonly state: AiChatProvider;
      readonly usage: AiSubscriptionUsage | null;
    },
  ): void => {
    store.aiProvider.save(input.chat.id, input.state);
    if (input.usage !== null) observeNativeSubscription(store, input.chat, input.usage);
  },
);
