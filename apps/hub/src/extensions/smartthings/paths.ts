import { ApiError } from '@smarteverything/domain';
import type { Store } from '../../store/store';

export const CALLBACK_PATH = '/smartthings/callback';

export const LINKED_PATH = '/smartthings/linked';

export const WEBHOOK_PATH = '/smartthings/webhook';

function publicUrlOf(publicUrl: string, path: string): URL {
  const base = publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`;
  return new URL(path.slice(1), base);
}

export interface PublicPaths {
  readonly redirectUri: string;
  readonly webhookUrl: string;
  readonly webhookPath: string;
}

function publicPathsOf(publicUrl: string): PublicPaths {
  const webhook = publicUrlOf(publicUrl, WEBHOOK_PATH);
  return {
    redirectUri: publicUrlOf(publicUrl, CALLBACK_PATH).toString(),
    webhookUrl: webhook.toString(),
    webhookPath: webhook.pathname,
  };
}

export function savedPaths(store: Store): PublicPaths | null {
  const url = store.settings.read().public_url;
  return url === null ? null : publicPathsOf(url);
}

export type PublicUrlState = 'missing' | 'unverified' | 'verified';

export function publicUrlState(store: Store): PublicUrlState {
  const settings = store.settings.read();
  if (settings.public_url === null) {
    return 'missing';
  }
  return settings.public_url_verified_at === null ? 'unverified' : 'verified';
}

export function verifiedPaths(store: Store): PublicPaths {
  const url = store.settings.read().public_url;
  if (url === null) {
    throw new ApiError(
      'public_url_not_verified',
      'SmartThings sends its sign-in and events to the public URL; save the public URL first.',
    );
  }
  if (publicUrlState(store) !== 'verified') {
    throw new ApiError(
      'public_url_not_verified',
      `SmartThings sends its sign-in and events to ${url}; verify that it reaches this server first.`,
    );
  }
  return publicPathsOf(url);
}
