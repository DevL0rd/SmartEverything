import { isDeepStrictEqual } from 'node:util';
import type { Context } from '@deepseek-ai/cordis';
import type { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { AiModelRoute } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessBoot } from './boot';
import type { HubSessionLog } from './persistence';
import { meteredTransport, subscriptionUse } from './models';
import type { ProcessSubscriptions } from './subscriptions';
import { SubscriptionRouteAdapter, SUBSCRIPTION_ROUTE } from '../providers/adapter';
import { RemoteSubscriptionAdapter } from '../providers/remote-adapter';
import { MeteredRouteAdapter } from './model-route';
import { HttpSubscriptionModels, authorizeConsumerSupplier } from './remote-models';
import { ProcessRouteAdapter } from './route-adapter';

export class ComputerModelRoutes {
  private ctx: Context | undefined;
  private readonly routes = new Map<string, AiModelRoute>();
  private readonly adapters = new Map<string, ProcessRouteAdapter>();
  private readonly disposers = new Map<string, () => void>();
  private installing: Promise<void> = Promise.resolve();
  constructor(
    private readonly boot: HarnessBoot,
    private readonly persistence: HubSessionLog,
    private readonly fetcher: typeof fetch,
    private readonly subscriptions: ProcessSubscriptions,
  ) {}
  bind(ctx: Context): void {
    this.ctx = ctx;
    ctx.effect(() => (): void => {
      for (const dispose of this.disposers.values()) dispose();
    });
  }
  get(id: string): AiModelRoute {
    const route = this.routes.get(id);
    if (route === undefined)
      throw new HarnessRuntimeError(
        'route_unavailable',
        'This initiating profile route has not been admitted.',
      );
    return route;
  }
  install(route: AiModelRoute): Promise<void> {
    const pending = this.installing.then((): void => {
      this.update(route);
    });
    this.installing = pending.catch((cause: unknown): void => {
      if (!(cause instanceof Error))
        throw new HarnessRuntimeError(
          'operation_failed',
          'Route installation failed without an Error.',
        );
    });
    return pending;
  }
  private assertIdentity(previous: AiModelRoute | undefined, route: AiModelRoute): void {
    if (previous !== undefined && !isDeepStrictEqual(routeIdentity(previous), routeIdentity(route)))
      throw new HarnessRuntimeError(
        'route_unavailable',
        'This route changed subscriber, provider or supplier identity. Reconnect the computer before admitting it.',
      );
  }
  private localSubscription(ctx: Context, route: AiModelRoute): LlmAdapter {
    const subscription = SUBSCRIPTION_ROUTE.parse({
      id: route.id,
      subscriberProfileId: route.profile_id,
      credentialGeneration: route.credential_generation,
      capabilityRevision: route.capability_revision,
      kind:
        route.auth.provider === 'anthropic'
          ? 'claude-subscription'
          : route.auth.kind === 'chatgpt-codex-oauth'
            ? 'codex-subscription'
            : 'chatgpt-subscription',
    });
    return new SubscriptionRouteAdapter({
      routes: [subscription],
      authorization: this.subscriptions.authorization,
      admission: this.subscriptions.admission,
      useAuthorization: subscriptionUse(this.persistence, this.boot.device_id),
      attachments: { resolveAttachments: (): typeof ctx.attachments => ctx.attachments },
    });
  }
  private adapter(ctx: Context, route: AiModelRoute): LlmAdapter {
    const attachments = { resolveAttachments: (): typeof ctx.attachments => ctx.attachments };
    if (route.auth.provider === 'openrouter')
      return new MeteredRouteAdapter(
        route,
        meteredTransport(this.boot, route, this.persistence, this.fetcher),
        attachments,
      );
    if (route.supplier.kind === 'device' && route.supplier.device_id === this.boot.device_id)
      return this.localSubscription(ctx, route);
    return new RemoteSubscriptionAdapter(
      route,
      new HttpSubscriptionModels(this.boot, this.fetcher),
      (options) => authorizeConsumerSupplier(this.persistence, route, options),
      attachments,
    );
  }
  private update(route: AiModelRoute): void {
    const ctx = this.ctx;
    if (ctx === undefined)
      throw new HarnessRuntimeError(
        'runtime_unavailable',
        'Computer model services are unavailable.',
      );
    if (route.state !== 'ready')
      throw new HarnessRuntimeError(
        'route_unavailable',
        'The initiating profile supplier route is unavailable.',
      );
    const previous = this.routes.get(route.id);
    this.assertIdentity(previous, route);
    if (isDeepStrictEqual(previous, route)) return;
    const adapter = this.adapter(ctx, route);
    const registered = this.adapters.get(route.id);
    if (registered === undefined) {
      const stable = new ProcessRouteAdapter(adapter);
      this.disposers.set(route.id, ctx.llm.registerAdapter([route.id], stable));
      this.adapters.set(route.id, stable);
    } else registered.replace(adapter);
    this.routes.set(route.id, route);
  }
}
interface RouteIdentity {
  readonly profile: string;
  readonly subscriber: string;
  readonly supplier: AiModelRoute['supplier'];
  readonly auth: AiModelRoute['auth'];
  readonly billing: AiModelRoute['billing'];
}
function routeIdentity(route: AiModelRoute): RouteIdentity {
  return {
    profile: route.profile_id,
    subscriber: route.subscriber_id,
    supplier: route.supplier,
    auth: route.auth,
    billing: route.billing,
  };
}
