import type { IncomingMessage } from 'node:http';
import {
  ApiError,
  CLIENT_TOKEN,
  HEALTH_SOURCE_TOKEN,
  hashClientToken,
  hashHealthSourceToken,
  type Access,
  type ClientRow,
  type HealthSourceRow,
  type PluginRequester,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { bearerOf } from './http';

export type Caller =
  | { readonly kind: 'anonymous' }
  | {
      readonly kind: 'client';
      readonly client: ClientRow;
      readonly profileId?: string;
      readonly via?: 'assistant';
      readonly local?: boolean;
      readonly chatId?: string;
      readonly pluginId?: string;
      readonly pluginRequester?: PluginRequester;
    }
  | { readonly kind: 'health_source'; readonly source: HealthSourceRow };

function unauthorized(message: string): ApiError {
  return new ApiError('unauthorized', message);
}

export function clientForToken(store: Store, token: string | null): ClientRow {
  if (token === null) {
    throw unauthorized('Send the device token as a bearer token.');
  }
  if (!CLIENT_TOKEN.safeParse(token).success) {
    throw unauthorized('The bearer token is not a device token.');
  }
  const client = store.clients.byTokenHash(hashClientToken(token));
  if (client === undefined) {
    throw unauthorized('No paired device has this token; it may have been removed.');
  }
  store.clients.seen(client);
  return client;
}

function healthSourceFor(store: Store, token: string | null): HealthSourceRow {
  if (token === null || !HEALTH_SOURCE_TOKEN.safeParse(token).success) {
    throw unauthorized('Send the health source token as a bearer token.');
  }
  const source = store.healthSources.activeByTokenHash(hashHealthSourceToken(token));
  if (source === undefined) {
    throw unauthorized('No active health source has this token; it may be revoked.');
  }
  return source;
}

export function authenticate(store: Store, request: IncomingMessage, access: Access): Caller {
  switch (access) {
    case 'public':
      return { kind: 'anonymous' };
    case 'health_source':
      return { kind: 'health_source', source: healthSourceFor(store, bearerOf(request)) };
    case 'member':
      return { kind: 'client', client: clientForToken(store, bearerOf(request)) };
    case 'owner': {
      const client = clientForToken(store, bearerOf(request));
      if (client.role !== 'owner') {
        throw new ApiError('forbidden', 'Only an owner may do this.');
      }
      return { kind: 'client', client };
    }
  }
}

class CallerKindError extends Error {
  override readonly name = 'CallerKindError';

  constructor(expected: Caller['kind'], received: Caller['kind']) {
    super(`The handler expected a ${expected} caller but received a ${received} caller.`);
  }
}

export function clientOf(caller: Caller): ClientRow {
  if (caller.kind !== 'client') {
    throw new CallerKindError('client', caller.kind);
  }
  return caller.client;
}

export function healthSourceOf(caller: Caller): HealthSourceRow {
  if (caller.kind !== 'health_source') {
    throw new CallerKindError('health_source', caller.kind);
  }
  return caller.source;
}

export function profileIdOf(store: Store, caller: Caller): string {
  if (caller.kind === 'client') {
    return caller.profileId ?? store.profiles.activeOf(caller.client.id).id;
  }
  if (caller.kind === 'health_source' && caller.source.client_id !== null) {
    return store.profiles.activeOf(caller.source.client_id).id;
  }
  throw new ApiError('forbidden', 'This token belongs to no paired app, so it has no profile.');
}
