import {
  AI_SUBSCRIPTION_USAGE,
  type AiChatRow,
  type AiSubscriptionUsage,
  type ProviderMetadata,
} from '@smarteverything/domain';
import type { HostStore } from '../store/host/host-store';
import { nativeSubscriptionScope } from '../store/repositories/ai-weekly-subscription-history';

export function observeNativeSubscription(
  store: HostStore,
  chat: AiChatRow,
  usage: AiSubscriptionUsage,
): void {
  const engine = chat.engine;
  if (engine.kind === 'dsh' || engine.kind !== usage.runtime) return;
  const scope = nativeSubscriptionScope(chat.profile_id, engine.kind, engine.device_id);
  store.aiWeeklySubscriptionHistory.observe(scope, usage);
}

export function metadataSubscriptionUsage(
  metadata: ProviderMetadata,
): AiSubscriptionUsage | undefined {
  const raw = metadata.initialization['subscription_usage'];
  return raw === undefined ? undefined : AI_SUBSCRIPTION_USAGE.parse(raw);
}
