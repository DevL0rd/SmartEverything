import type { ConversationAuthority } from '../harness/authority-contract';
import type { IncomingMessage } from 'node:http';
import {
  ApiError,
  CLIENT_TOKEN,
  hashClientToken,
  turnRoleOf,
  type Access,
  type ClientRow,
  type PluginRequester,
  type Role,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { RepeatGate } from './repeat-gate';
import { executionRole } from '../assistant/turn-authority';
import type { ChatOwner } from '../assistant/chat-directory';
import type { Store } from '../store/store';
import { bearerOf } from './http';
import { accessEntryOf, effectiveClient, type AccessEntry } from './person-access';

export type Caller =
  | { readonly kind: 'anonymous' }
  | {
      readonly kind: 'service';
      readonly authority: ConversationAuthority;
      readonly profileId: string;
      readonly chatId: string | null;
      readonly pluginId?: string;
      readonly pluginRequester?: PluginRequester;
    }
  | {
      readonly kind: 'client';
      readonly client: ClientRow;
      readonly profileId?: string;
      readonly via?: 'assistant';
      readonly mcpOrigin?: 'personal' | 'oauth' | 'computer';
      readonly authority?: ConversationAuthority;
      readonly local?: boolean;
      readonly chatId?: string;
      readonly pluginId?: string;
      readonly pluginRequester?: PluginRequester;
    };

const log = new Logger('hub.auth');
const rejections = new RepeatGate(30_000);

function unauthorized(message: string, reason: string, kind: string, length: number): ApiError {
  const suppressed = rejections.pass(`${kind}:${reason}`);
  if (suppressed !== null) {
    log.warn('credential.rejected', {
      kind,
      reason,
      presentedLength: length,
      suppressedSince: suppressed,
    });
  }
  return new ApiError('unauthorized', message);
}

export function clientForToken(store: Store, token: string | null, entry: AccessEntry): ClientRow {
  if (token === null) {
    throw unauthorized('Send the device token as a bearer token.', 'missing', 'client', 0);
  }
  if (!CLIENT_TOKEN.safeParse(token).success) {
    throw unauthorized(
      'The bearer token is not a device token.',
      'malformed',
      'client',
      token.length,
    );
  }
  const client = store.clients.byTokenHash(hashClientToken(token));
  if (client === undefined) {
    throw unauthorized(
      'No paired device has this token; it may have been removed.',
      'unknown',
      'client',
      token.length,
    );
  }
  const effective = effectiveClient(store, client, entry);
  store.clients.seen(client);
  return effective;
}

export function authenticate(
  store: Store,
  request: IncomingMessage,
  access: Access,
  statusOnly: boolean,
): Caller {
  switch (access) {
    case 'public':
      return { kind: 'anonymous' };
    case 'member':
    case 'owner':
      return {
        kind: 'client',
        client: clientForToken(store, bearerOf(request), accessEntryOf(request, statusOnly)),
      };
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

export function profileIdOf(store: Store, caller: Caller): string {
  if (caller.kind === 'service') return caller.profileId;
  if (caller.kind === 'client') {
    return caller.profileId ?? store.profiles.activeOf(caller.client.id).id;
  }
  throw new ApiError('forbidden', 'This token belongs to no paired app, so it has no profile.');
}

export function roleOfCaller(caller: Caller): ClientRow['role'] {
  if (caller.kind === 'service') return executionRole(caller.authority);
  return caller.kind === 'client' && caller.pluginRequester !== undefined
    ? turnRoleOf(caller.pluginRequester)
    : clientOf(caller).role;
}

export function isOwnerOrSelf(role: Role, self: boolean): boolean {
  return role === 'owner' || self;
}

export function ownerOrSelf(role: Role, self: boolean): void {
  if (!isOwnerOrSelf(role, self)) {
    throw new ApiError('forbidden', 'Only an owner can do this for another person.');
  }
}

export function confinedChatOf(caller: Caller): string | null | undefined {
  if (caller.kind !== 'client' && caller.kind !== 'service') return undefined;
  if (caller.pluginRequester !== 'unlisted') return undefined;
  return caller.chatId ?? null;
}

export function chatOwnerOf(store: Store, caller: Caller): ChatOwner {
  const confinedTo = confinedChatOf(caller);
  return {
    profileId: profileIdOf(store, caller),
    role: roleOfCaller(caller),
    ...(confinedTo === undefined ? {} : { confinedTo }),
  };
}
