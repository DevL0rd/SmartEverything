import { createHash } from 'node:crypto';
import {
  ApiError,
  IMAGE_OPERATION_ORIGIN,
  type ImageOperationOrigin,
} from '@smarteverything/domain';
import { currentExecutionAuthority } from '../assistant/turn-authority';
import { effectiveTools } from '../assistant/coordination/grants';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { ImageActor, ImageEffect } from '../assistant/image/contract';
import type { Store } from '../store/store';
import { profileIdOf, type Caller } from './auth';
import { ImageAdmissionError } from './image-admission';
import { admitImageWait } from './image-wait-authority';

const IMAGE_SPEND_TOOL = 'start_image_operation';
export interface ImageSpend {
  readonly background: boolean;
  readonly profileId: string;
}
export interface ImageAuthorityOptions {
  readonly store: Store;
  readonly configured: () => boolean;
  readonly spend: (spend: ImageSpend) => void;
}
interface ImagePrincipal {
  readonly caller: Extract<Caller, { kind: 'client' | 'service' }>;
  readonly profileId: string;
  readonly scopes: readonly ConversationAuthority[];
  readonly origin: ImageOperationOrigin;
}
export function imageActorOf(options: ImageAuthorityOptions, caller: Caller): ImageActor {
  if (caller.kind !== 'client' && caller.kind !== 'service')
    throw new ApiError(
      'forbidden',
      'Image operations require an authenticated initiating profile.',
    );
  const profileId = profileIdOf(options.store, caller);
  const scopes = [
    ...new Map(
      [caller.kind === 'service' ? caller.authority : undefined, currentExecutionAuthority()]
        .filter((scope): scope is ConversationAuthority => scope !== undefined)
        .map((scope) => [scope.event_id, scope] as const),
    ).values(),
  ];
  const principal = imagePrincipal({ caller, profileId, scopes });
  authorizeImage(options, principal, 'read', '');
  return {
    profileId,
    key: principal.origin.principal_id,
    origin: principal.origin,
    authorize: (effect, chatId): void => {
      authorizeImage(options, principal, effect, chatId);
    },
  };
}
function imagePrincipal(
  input: Pick<ImagePrincipal, 'caller' | 'profileId' | 'scopes'>,
): ImagePrincipal {
  const scope = input.scopes[0];
  const origin = IMAGE_OPERATION_ORIGIN.parse({
    kind: scope === undefined ? 'client' : 'execution',
    ...principalAttribution(input.caller),
    event_id: scope?.event_id ?? null,
    grant_fingerprint:
      scope === undefined
        ? null
        : createHash('sha256').update(JSON.stringify(input.scopes)).digest('hex'),
  });
  return { ...input, origin };
}
function authorizeImage(
  options: ImageAuthorityOptions,
  principal: ImagePrincipal,
  effect: ImageEffect,
  chatId: string,
): void {
  validatePrincipal(options.store, principal, chatId);
  if (effect === 'read') return;
  if (effect === 'wait') {
    admitImageWait(options.store, chatId, principal.scopes);
    return;
  }
  if (chatId === '') throw new ApiError('forbidden', 'Image spend requires a specific owned chat.');
  if (effect === 'persist') {
    admitImageToolEnabled(options.store);
    return;
  }
  admitImageTools(options.store, principal, chatId);
  if (!options.configured())
    throw new ImageAdmissionError(
      'not_configured',
      'The OpenRouter image-provider key is not configured.',
    );
  options.spend({
    background: imageBackground(options.store, principal, chatId),
    profileId: principal.profileId,
  });
}
function validatePrincipal(store: Store, principal: ImagePrincipal, chatId: string): void {
  store.profiles.byId(principal.profileId);
  if (chatId === '') return;
  store.aiChats.chat(chatId);
  const initiatingChat = principal.caller.chatId;
  if (initiatingChat !== undefined && initiatingChat !== null && initiatingChat !== chatId)
    throw new ApiError('forbidden', 'An image tool cannot leave its initiating chat.');
}
function principalAttribution(caller: ImagePrincipal['caller']): {
  readonly principal_id: string;
  readonly client_id: string | null;
  readonly plugin_id: string | null;
} {
  const plugin_id = caller.pluginId ?? null;
  if (caller.kind === 'client')
    return { principal_id: `client:${caller.client.id}`, client_id: caller.client.id, plugin_id };
  return {
    principal_id: `service:${caller.authority.event_id}`,
    client_id: caller.authority.client_id,
    plugin_id,
  };
}
function imageBackground(store: Store, principal: ImagePrincipal, chatId: string): boolean {
  return (
    principal.caller.kind === 'service' ||
    store.aiChats.chat(chatId).kind === 'subagent' ||
    principal.scopes.some((scope) => scope.kind === 'service')
  );
}

function admitImageTools(store: Store, principal: ImagePrincipal, chatId: string): void {
  const tools = effectiveTools(store, store.aiChats.chat(chatId));
  if (tools !== null && !tools.includes(IMAGE_SPEND_TOOL))
    throw new ImageAdmissionError(
      'grant_required',
      'This chat’s tool grant does not allow the metered image operation.',
    );
  for (const scope of principal.scopes) {
    if (scope.tools !== null && !scope.tools.includes(IMAGE_SPEND_TOOL))
      throw new ImageAdmissionError(
        'grant_required',
        'The initiating execution tool grant does not allow the metered image operation.',
      );
  }
  admitImageToolEnabled(store);
}
function admitImageToolEnabled(store: Store): void {
  if (store.settings.read().mcp_disabled_tools.includes(IMAGE_SPEND_TOOL))
    throw new ImageAdmissionError(
      'tool_disabled',
      'The metered image-operation tool is disabled in this home.',
    );
}
