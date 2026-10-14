import { createHash } from 'node:crypto';
import { AI_SUBSCRIPTION_HOST_STATUS } from '@smarteverything/domain';
import type {
  AiSubscriptionHostStatus,
  AiSubscriptionInteraction,
  HarnessSubscriptionRequest,
  AiModelRouteModel,
} from '@smarteverything/domain';
import type { SubscriptionCredential } from '../credentials/contracts';
import type { SubscriptionModelCatalog } from '../providers/catalog';
import type { SubscriptionBillingSnapshot } from '../providers/billing';
import type { HarnessBoot } from './boot';

interface SubscriptionStatusInput {
  readonly boot: HarnessBoot;
  readonly request: HarnessSubscriptionRequest;
  readonly state: AiSubscriptionHostStatus['state'];
  readonly message: string;
  readonly credential?: SubscriptionCredential;
  readonly catalog?: SubscriptionModelCatalog;
  readonly billing?: SubscriptionBillingSnapshot;
  readonly interaction?: AiSubscriptionInteraction;
  readonly remoteRevocationConfirmed?: boolean;
}
export function subscriptionStatus(input: SubscriptionStatusInput): AiSubscriptionHostStatus {
  const { request, credential, billing } = input;
  const observed = new Date().toISOString();
  return AI_SUBSCRIPTION_HOST_STATUS.parse({
    provider: request.provider,
    profile_id: request.profile_id,
    route_id: request.route_id,
    state: input.state,
    message: input.message,
    credential_generation: credential === undefined ? null : credential.generation,
    account_id: subscriptionAccount(credential),
    scopes: credential?.kind === 'chatgpt-subscription' ? credential.scopes : [],
    observed_at: observed,
    billing_checked_at: billing === undefined ? null : new Date(billing.checkedAt).toISOString(),
    billing_expires_at: billing === undefined ? null : new Date(billing.expiresAt).toISOString(),
    interaction: input.interaction ?? null,
    remote_revocation_confirmed: input.remoteRevocationConfirmed ?? null,
    route: subscriptionRoute(input, observed),
  });
}
function subscriptionRoute(
  input: SubscriptionStatusInput,
  observed: string,
): AiSubscriptionHostStatus['route'] {
  const { request, credential, catalog } = input;
  const revision = createHash('sha256')
    .update(JSON.stringify({ generation: credential?.generation, models: catalog?.models }))
    .digest('hex');
  const fields = {
    id: request.route_id,
    profile_id: request.profile_id,
    supplier: { kind: 'device', device_id: input.boot.device_id },
    subscriber_id: request.profile_id,
    auth: subscriptionRouteAuth(request.provider),
    billing: 'subscription-only',
    fallback: 'none',
    background_authorized: false,
    ...(credential === undefined ? {} : { credential_generation: credential.generation }),
    capability_revision: revision,
    models:
      catalog === undefined
        ? []
        : catalog.models.map((model) => advertisedModel(model, revision, observed)),
  };
  return AI_SUBSCRIPTION_HOST_STATUS.shape.route.parse(
    input.state === 'ready'
      ? { ...fields, state: 'ready' }
      : {
          ...fields,
          state: 'unavailable',
          failure: { code: 'route_unavailable', message: input.message, retry_at: null },
        },
  );
}
function subscriptionAccount(credential: SubscriptionCredential | undefined): string | null {
  if (credential === undefined) return null;
  if (credential.kind === 'chatgpt-subscription') return credential.subject;
  return credential.kind === 'codex-subscription' ? credential.accountId : null;
}
function subscriptionRouteAuth(provider: HarnessSubscriptionRequest['provider']): {
  readonly provider: string;
  readonly kind: string;
} {
  if (provider === 'claude') return { provider: 'anthropic', kind: 'claude-subscription-oauth' };
  return {
    provider: 'openai',
    kind: provider === 'chatgpt' ? 'chatgpt-sign-in' : 'chatgpt-codex-oauth',
  };
}
function advertisedModel(
  model: SubscriptionModelCatalog['models'][number],
  revision: string,
  discovered: string,
): AiModelRouteModel {
  return {
    id: model.id,
    name: model.name,
    capabilities: {
      revision,
      input_modalities: model.input.includes('image') ? ['text', 'image'] : ['text'],
      output_modalities: ['text'],
      reasoning: model.reasoning,
      efforts:
        model.thinkingLevelMap === undefined
          ? []
          : Object.entries(model.thinkingLevelMap).flatMap(([effort, value]) =>
              value === null ? [] : [effort],
            ),
      local_tools: true,
      context_tokens: model.contextWindow,
      max_output_tokens: model.maxTokens,
      discovered_at: discovered,
    },
  };
}
