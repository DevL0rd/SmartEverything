import type {
  AiChatRow,
  AiChatRuntimeProvider,
  AiSubscriptionUsage,
  CodexProviderEvent,
} from '@smarteverything/domain';
import { storeUnit } from '../../../store/host/unit';
import { updatedCodexProvider } from '../codex/provider-state';
import { providerAgents } from './agents';
import type { ComputerEvent } from './provider-state';
import { observeNativeSubscription } from '../../native-subscription';

export const CODEX_RECEIVE_UNIT = storeUnit(
  (store, input: { readonly chatId: string; readonly event: CodexProviderEvent }): boolean => {
    if (!store.aiRuntimeProvider.append(input.chatId, { runtime: 'codex', event: input.event }))
      return false;
    const state = store.aiRuntimeProvider.read(input.chatId, false);
    if (state?.runtime === 'codex')
      store.aiRuntimeProvider.save(input.chatId, updatedCodexProvider(state, input.event));
    return true;
  },
);

export const RUNTIME_METADATA_SAVE_UNIT = storeUnit(
  (
    store,
    input: {
      readonly chat: AiChatRow;
      readonly state: AiChatRuntimeProvider;
      readonly usage: AiSubscriptionUsage | null;
    },
  ): void => {
    store.aiRuntimeProvider.save(input.chat.id, input.state);
    if (input.usage !== null) observeNativeSubscription(store, input.chat, input.usage);
  },
);

export const SUBSCRIPTION_USAGE_UNIT = storeUnit(
  (
    store,
    input: {
      readonly chat: AiChatRow;
      readonly current: AiSubscriptionUsage;
      readonly observed: AiSubscriptionUsage;
    },
  ): void => {
    store.aiProvider.saveSubscriptionUsage(input.chat.id, input.current);
    observeNativeSubscription(store, input.chat, input.observed);
  },
);

export const PROVIDER_AGENTS_UNIT = storeUnit(
  (
    store,
    input: { readonly chat: AiChatRow; readonly event: ComputerEvent; readonly now: string },
  ): void => {
    providerAgents({ store, now: input.now }, input.chat, input.event);
  },
);
