import { ordinaryModelRequest } from '../host/model-request-context';
import type { AiModelRoute } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
import type { SubscriptionUseAuthorizationPort } from '../providers/principal';
import type { MeteredRouteTransport } from './model-route';
import { harnessInference } from './http';
import type { HarnessBoot } from './boot';
import type { HarnessControlPersistence } from './contracts';

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
          {
            boot,
            claim: persistence.claim(options.sessionId),
            routeId: route.id,
            fetcher,
            ordinary_request: ordinaryModelRequest(),
          },
          input,
          init,
        );
      },
  };
}
