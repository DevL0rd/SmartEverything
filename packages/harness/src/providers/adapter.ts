import { z } from 'zod';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { TRANSIENT_RETRY_POLICY } from './transient-retry';
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  PreparedAdapterCall,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm';
import type { SubscriptionAuthorization } from '../authorization/service';
import { SUBSCRIPTION_ROUTE_ID } from '../credentials/contracts';
import type { SubscriptionCredential } from '../credentials/contracts';
import { discoverSubscriptionModels } from './catalog';
import type { SubscriptionModelCatalog } from './catalog';
import { assertPlanOnlyAdmission, unavailableSubscriptionAdmission } from './admission';
import type { PlanOnlyAdmission, SubscriptionAdmissionPort } from './admission';
import { authorizeSubscriptionUse, unavailableSubscriptionUseAuthorization } from './principal';
import type { SubscriptionUseAuthorizationPort } from './principal';
import { subscriptionPiDelegate } from './pi-delegate';
import type { SubscriptionAttachmentOptions } from './pi-delegate';
import { SubscriptionProviderError } from './errors';
import { subscriptionStreamOutcome } from './stream-outcome';
import { SubscriptionInferenceTransport } from './inference-transport';

export const SUBSCRIPTION_ROUTE = z.strictObject({
  id: SUBSCRIPTION_ROUTE_ID,
  kind: z.enum(['claude-subscription', 'chatgpt-subscription', 'codex-subscription']),
  subscriberProfileId: z.string().min(1).max(200),
  credentialGeneration: z.uuid().optional(),
  capabilityRevision: z.string().min(1).max(200).optional(),
});
export type SubscriptionRoute = z.infer<typeof SUBSCRIPTION_ROUTE>;
export interface SubscriptionRouteOptions {
  readonly routes: readonly SubscriptionRoute[];
  readonly authorization: SubscriptionAuthorization;
  readonly admission?: SubscriptionAdmissionPort;
  readonly useAuthorization?: SubscriptionUseAuthorizationPort;
  readonly attachments?: SubscriptionAttachmentOptions;
  readonly fetcher?: typeof fetch;
}

export class SubscriptionRouteAdapter extends LlmAdapter {
  private readonly catalogs = new Map<string, SubscriptionModelCatalog>();
  private readonly routes: ReadonlyMap<string, SubscriptionRoute>;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: SubscriptionRouteOptions) {
    super();
    this.fetcher = options.fetcher ?? fetch;
    const routes = options.routes.map((route) => SUBSCRIPTION_ROUTE.parse(route));
    if (new Set(routes.map((route) => route.id)).size !== routes.length)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Subscription route identifiers must be unique.',
      );
    this.routes = new Map(routes.map((route) => [route.id, route]));
  }

  override providerInfo(provider: string): LlmProviderInfo {
    const route = this.route(provider);
    return {
      id: provider,
      name: route.kind === 'claude-subscription' ? 'Claude subscription' : 'ChatGPT subscription',
    };
  }

  override providerRetryPolicy(provider: string): ResolvedRetryPolicy {
    this.route(provider);
    return TRANSIENT_RETRY_POLICY;
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const { record, catalog } = await this.snapshot(provider, new AbortController().signal);
    return subscriptionPiDelegate(
      record,
      catalog,
      this.options.attachments ?? {},
      this.options.fetcher,
    ).listModels(provider);
  }

  override async resolveModel(
    provider: string,
    model: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<LlmResolvedModelInfo> {
    const { record, catalog } = await this.snapshot(provider, signal);
    return subscriptionPiDelegate(
      record,
      catalog,
      this.options.attachments ?? {},
      this.options.fetcher,
    ).resolveModel(provider, model, signal);
  }

  override async prepareCall(
    provider: string,
    model: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<PreparedAdapterCall> {
    const { record, catalog } = await this.snapshot(provider, signal);
    const resolved = await subscriptionPiDelegate(
      record,
      catalog,
      this.options.attachments ?? {},
      this.options.fetcher,
    ).resolveModel(provider, model, signal);
    return { model: resolved, stream: (options) => this.run(options, record.generation) };
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.run(options);
  }

  async refreshCatalog(provider: string, signal: AbortSignal): Promise<SubscriptionModelCatalog> {
    const record = await this.record(provider, signal);
    this.catalogs.delete(provider);
    const catalog = await discoverSubscriptionModels(record, signal, this.options.fetcher);
    const current = await this.options.authorization.credentials.read(provider);
    if (current?.generation !== record.generation)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Subscription account changed during model discovery.',
      );
    this.catalogs.set(provider, catalog);
    return catalog;
  }

  private async *run(
    options: GenerateOptions,
    expectedGeneration?: string,
  ): AsyncIterable<StreamChunk> {
    const invalidated = new AbortController();
    const signal =
      options.signal === undefined
        ? invalidated.signal
        : AbortSignal.any([options.signal, invalidated.signal]);
    const { record, catalog } = await this.snapshot(options.provider, signal);
    if (expectedGeneration !== undefined && record.generation !== expectedGeneration)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Prepared model call belongs to a different subscription account.',
      );
    const unsubscribe = this.options.authorization.credentials.onChanged((id, generation) => {
      if ((id === record.routeId || id === '*') && generation !== record.generation)
        invalidated.abort('Subscription account changed.');
    });
    try {
      const current = await this.options.authorization.credentials.read(options.provider);
      if (current?.generation !== record.generation)
        invalidated.abort('Subscription account changed.');
      const admission = await this.authorizeRequest(options, record, signal);
      await this.assertDispatch(record, admission.expires, signal);
      const transport = new SubscriptionInferenceTransport(this.fetcher, () =>
        this.assertDispatch(record, admission.expires, signal),
      );
      const stream = subscriptionPiDelegate(
        record,
        catalog,
        this.options.attachments ?? {},
        transport.fetch,
      ).stream({
        ...options,
        signal,
      });
      for await (const chunk of stream)
        yield subscriptionStreamOutcome(chunk, transport.failureFacts());
    } finally {
      unsubscribe();
    }
  }

  private async authorizeRequest(
    options: GenerateOptions,
    record: SubscriptionCredential,
    signal: AbortSignal,
  ): Promise<Extract<PlanOnlyAdmission, { state: 'verified' }>> {
    const route = this.route(options.provider);
    await authorizeSubscriptionUse(
      this.options.useAuthorization ?? unavailableSubscriptionUseAuthorization,
      options,
      {
        subscriberProfileId: route.subscriberProfileId,
        supplierHostId: record.hostId,
        credentialGeneration: record.generation,
        ...(route.capabilityRevision === undefined
          ? {}
          : { capabilityRevision: route.capabilityRevision }),
      },
      signal,
    );
    return assertPlanOnlyAdmission(
      this.options.admission ?? unavailableSubscriptionAdmission,
      record,
      signal,
    );
  }

  private async assertDispatch(
    record: SubscriptionCredential,
    proofExpires: number,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const current = await this.options.authorization.credentials.read(record.routeId);
    signal.throwIfAborted();
    if (JSON.stringify(current) !== JSON.stringify(record) || proofExpires <= Date.now())
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Subscription credential or fresh billing proof changed before dispatch.',
      );
  }

  private async snapshot(
    provider: string,
    signal: AbortSignal,
  ): Promise<{
    readonly record: SubscriptionCredential;
    readonly catalog: SubscriptionModelCatalog;
  }> {
    const record = await this.record(provider, signal);
    const cached = this.catalogs.get(provider);
    const catalog =
      cached?.generation === record.generation
        ? cached
        : await this.refreshCatalog(provider, signal);
    return { record, catalog };
  }

  private async record(provider: string, signal: AbortSignal): Promise<SubscriptionCredential> {
    const route = this.route(provider);
    const record = await this.options.authorization.resolve(provider, signal);
    if (
      record.kind !== route.kind ||
      record.subscriberProfileId !== route.subscriberProfileId ||
      record.generation !== route.credentialGeneration
    )
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Stored OAuth provider does not match the selected subscription route.',
      );
    return record;
  }

  private route(provider: string): SubscriptionRoute {
    const route = this.routes.get(provider);
    if (route === undefined)
      throw new SubscriptionProviderError(
        'MODEL_UNAVAILABLE',
        'Selected subscription model route is not registered on this supplying host.',
      );
    return route;
  }
}
