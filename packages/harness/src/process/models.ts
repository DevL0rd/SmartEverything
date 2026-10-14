import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { AiModelRoute } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
import { LocalSubscriptionStorage } from '../credentials/local-storage';
import { SubscriptionCredentials } from '../credentials/service';
import { SubscriptionAuthorization } from '../authorization/service';
import { SubscriptionBillingAdmission } from '../providers/billing';
import type { ProcessSubscriptions } from './subscriptions';
import { installSubscriptionRoutes } from '../providers/install';
import type { SubscriptionUseAuthorizationPort } from '../providers/principal';
import { MeteredRouteAdapter } from './model-route';
import type { MeteredRouteTransport } from './model-route';
import { harnessInference } from './http';
import type { HarnessBoot } from './boot';
import type { HarnessControlPersistence } from './contracts';

export async function installProcessModels(
  ctx: Context,
  boot: HarnessBoot,
  routes: readonly AiModelRoute[],
  ports: { readonly persistence: HarnessControlPersistence; readonly fetcher: typeof fetch },
): Promise<void> {
  const { persistence, fetcher } = ports;
  const subscriptions = routes.filter(
    (route) =>
      route.auth.provider !== 'openrouter' &&
      route.supplier.kind === 'device' &&
      route.supplier.device_id === boot.device_id,
  );
  if (subscriptions.length > 0)
    await installSubscriptionModels(ctx, { boot, routes: subscriptions, persistence });
  for (const route of routes.filter(
    (entry) => entry.auth.provider === 'openrouter' && entry.state === 'ready',
  )) {
    const adapter = new MeteredRouteAdapter(
      route,
      meteredTransport(boot, route, persistence, fetcher),
      {
        resolveAttachments: (): typeof ctx.attachments => ctx.attachments,
      },
    );
    ctx.effect(() => ctx.llm.registerAdapter([route.id], adapter));
  }
}
export async function installSubscriptionModels(
  ctx: Context,
  input: {
    readonly boot: HarnessBoot;
    readonly routes: readonly AiModelRoute[];
    readonly persistence: HarnessControlPersistence;
    readonly hostSubscriptions?: ProcessSubscriptions;
  },
): Promise<void> {
  const { boot, routes, persistence, hostSubscriptions } = input;
  const authorization =
    hostSubscriptions === undefined
      ? await processAuthorization(ctx, boot)
      : hostSubscriptions.authorization;
  installSubscriptionRoutes(ctx, {
    routes: routes.map((route) => ({
      id: route.id,
      subscriberProfileId: route.profile_id,
      capabilityRevision: route.capability_revision,
      ...(route.credential_generation === undefined
        ? {}
        : { credentialGeneration: route.credential_generation }),
      kind:
        route.auth.provider === 'anthropic'
          ? ('claude-subscription' as const)
          : route.auth.kind === 'chatgpt-codex-oauth'
            ? ('codex-subscription' as const)
            : ('chatgpt-subscription' as const),
    })),
    authorization,
    admission:
      hostSubscriptions === undefined
        ? new SubscriptionBillingAdmission(fetch, authorization.claudeProfile)
        : hostSubscriptions.admission,
    attachments: { resolveAttachments: (): typeof ctx.attachments => ctx.attachments },
    useAuthorization: subscriptionUse(persistence, boot.device_id),
  });
}
export function subscriptionUse(
  persistence: HarnessControlPersistence,
  hostId: string,
): SubscriptionUseAuthorizationPort {
  return {
    principal: async (
      options,
    ): Promise<Awaited<ReturnType<SubscriptionUseAuthorizationPort['principal']>>> => {
      if (options.sessionId === undefined)
        throw new HarnessRuntimeError(
          'ownership_lost',
          'Model requests require their initiating native conversation.',
        );
      const metadata = await persistence.metadata(options.sessionId);
      const claim = persistence.claim(options.sessionId);
      await persistence.verify(claim);
      return {
        profileId: metadata.profile_id,
        source: options.purpose === undefined ? 'interactive' : 'maintenance',
        authorizationId: claim.token,
        sessionId: String(options.sessionId),
      };
    },
    authorize: async (input): Promise<boolean> => {
      const metadata = await persistence.metadata(input.principal.sessionId);
      if (input.capabilityRevision === undefined)
        throw new HarnessRuntimeError(
          'route_unavailable',
          'Subscription inference requires its exact advertised account revision.',
        );
      await persistence.verify(persistence.claim(input.principal.sessionId), {
        route_id: input.routeId,
        model: input.model,
        capability_revision: input.capabilityRevision,
        credential_generation: input.credentialGeneration,
      });
      return metadata.profile_id === input.subscriberProfileId && input.supplierHostId === hostId;
    },
  };
}
export function meteredTransport(
  boot: HarnessBoot,
  route: AiModelRoute,
  persistence: HarnessControlPersistence,
  fetcher: typeof fetch = fetch,
): MeteredRouteTransport {
  return {
    key: () => Promise.resolve('harness-managed-supplier'),
    authorize: async (options): Promise<void> => {
      if (options.sessionId === undefined)
        throw new HarnessRuntimeError(
          'ownership_lost',
          'Model requests require an owned native conversation.',
        );
      await persistence.verify(persistence.claim(options.sessionId));
    },
    fetch:
      (options): typeof fetch =>
      (input, init): Promise<Response> => {
        if (options.sessionId === undefined)
          throw new HarnessRuntimeError('ownership_lost', 'Inference has no native session grant.');
        return harnessInference(
          { boot, claim: persistence.claim(options.sessionId), routeId: route.id, fetcher },
          input,
          init,
        );
      },
  };
}

async function processAuthorization(
  ctx: Context,
  boot: HarnessBoot,
): Promise<SubscriptionAuthorization> {
  const storage = new LocalSubscriptionStorage(join(boot.state_directory, 'subscriptions'));
  await storage.exclusive(() => Promise.resolve());
  const authorization = new SubscriptionAuthorization(
    new SubscriptionCredentials(storage, boot.device_id),
  );
  ctx.effect(() => (): void => {
    authorization.credentials.dispose();
  });
  return authorization;
}
