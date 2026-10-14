import type { CredentialStore, OAuthCredential, OAuthAuth } from '@earendil-works/pi-ai';
import type { SubscriptionCredential } from '../credentials/contracts';
import { SubscriptionProviderError } from './errors';

export function frozenSubscriptionAuth(record: SubscriptionCredential): {
  readonly store: CredentialStore;
  readonly oauth: OAuthAuth;
} {
  const credential: OAuthCredential = {
    type: 'oauth',
    access: record.access,
    refresh: record.refresh,
    expires: record.expires,
  };
  const unavailable = (): Promise<never> =>
    Promise.reject(
      new SubscriptionProviderError(
        'AUTH_INVALID',
        'Subscription refresh and login belong to the supplying host authorization service.',
      ),
    );
  return {
    store: {
      read: (route) => Promise.resolve(route === record.routeId ? credential : undefined),
      list: () => Promise.resolve([{ providerId: record.routeId, type: 'oauth' }]),
      modify: unavailable,
      delete: unavailable,
    },
    oauth: {
      name: record.kind === 'claude-subscription' ? 'Claude subscription' : 'ChatGPT subscription',
      isSubscription: true,
      login: unavailable,
      refresh: unavailable,
      toAuth: () => Promise.resolve({ apiKey: credential.access }),
    },
  };
}
