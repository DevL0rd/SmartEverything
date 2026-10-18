import { z } from 'zod';
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import { SubscriptionProviderError } from './errors';

const SUBSCRIPTION_USE_PRINCIPAL = z.strictObject({
  profileId: z.string().min(1).max(200),
  source: z.enum(['interactive', 'automation', 'voice', 'camera', 'subagent', 'maintenance']),
  authorizationId: z.string().min(1).max(200),
  sessionId: z.string().min(1).max(200),
});
type SubscriptionUsePrincipal = z.infer<typeof SUBSCRIPTION_USE_PRINCIPAL>;

export interface SubscriptionUseAuthorizationPort {
  principal(options: GenerateOptions): Promise<SubscriptionUsePrincipal>;
  authorize(
    input: {
      readonly routeId: string;
      readonly model: string;
      readonly capabilityRevision?: string;
      readonly subscriberProfileId: string;
      readonly supplierHostId: string;
      readonly credentialGeneration: string;
      readonly principal: SubscriptionUsePrincipal;
    },
    signal: AbortSignal,
  ): Promise<boolean>;
}

export const unavailableSubscriptionUseAuthorization: SubscriptionUseAuthorizationPort = {
  principal: () =>
    Promise.reject(
      new SubscriptionProviderError(
        'AUTH_DENIED',
        'No initiating profile and subscription-use grant were supplied.',
      ),
    ),
  authorize: () => Promise.resolve(false),
};

export async function authorizeSubscriptionUse(
  port: SubscriptionUseAuthorizationPort,
  options: GenerateOptions,
  authority: {
    readonly capabilityRevision?: string;
    readonly subscriberProfileId: string;
    readonly supplierHostId: string;
    readonly credentialGeneration: string;
  },
  signal: AbortSignal,
): Promise<void> {
  const principal = SUBSCRIPTION_USE_PRINCIPAL.parse(await port.principal(options));
  if (options.sessionId === undefined || principal.sessionId !== String(options.sessionId))
    throw new SubscriptionProviderError(
      'AUTH_DENIED',
      'Subscription-use grant does not belong to this native session.',
    );
  if (
    principal.profileId !== authority.subscriberProfileId ||
    !(await port.authorize(
      { routeId: options.provider, model: options.model, ...authority, principal },
      signal,
    ))
  )
    throw new SubscriptionProviderError(
      'AUTH_DENIED',
      'Initiating profile has no applicable grant to use this subscriber model route.',
    );
}
