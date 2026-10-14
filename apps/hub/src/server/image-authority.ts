import { createHash } from 'node:crypto';
import {
  ApiError,
  IMAGE_OPERATION_ORIGIN,
  type ImageOperationOrigin,
} from '@smarteverything/domain';
import {
  currentExecutionAuthorities,
  validateExecutionAuthority,
} from '../assistant/execution-authority';
import { effectiveTools } from '../assistant/coordination/grants';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { ImageActor, ImageEffect } from '../assistant/image/contract';
import type { Store } from '../store/store';
import { profileIdOf, type Caller } from './auth';
import { ImageAdmissionError } from './image-admission';
import { admitImageWait } from './image-wait-authority';

export const IMAGE_SPEND_TOOL = 'start_image_operation';
export interface ImageAuthorityOptions {
  readonly store: Store;
  readonly configured: () => boolean;
  readonly spend: (background: boolean) => void;
  readonly now: () => Date;
}
interface ImagePrincipal {
  readonly caller: Extract<Caller, { kind: 'client' | 'service' }>;
  readonly profileId: string;
  readonly scopes: readonly ConversationAuthority[];
  readonly origin: ImageOperationOrigin;
  readonly fence: NativeImageFence | null;
}
interface NativeImageFence {
  readonly sessionId: string;
  readonly epoch: number;
  readonly token: string;
  readonly runtimeInstance: string;
  readonly connectionGeneration: string;
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
      [
        ...(caller.kind === 'service' ? [caller.authority] : []),
        ...currentExecutionAuthorities(),
      ].map((scope) => [scope.event_id, scope] as const),
    ).values(),
  ];
  const principal = imagePrincipal(options, { caller, profileId, scopes });
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
  options: ImageAuthorityOptions,
  input: Pick<ImagePrincipal, 'caller' | 'profileId' | 'scopes'>,
): ImagePrincipal {
  const scope = input.scopes[0];
  const fence = initiatingFence(options, input);
  const origin = IMAGE_OPERATION_ORIGIN.parse({
    kind: scope === undefined ? 'client' : 'execution',
    ...principalAttribution(input.caller),
    event_id: scope?.event_id ?? null,
    session_id: fence?.sessionId ?? null,
    epoch: fence?.epoch ?? null,
    grant_fingerprint:
      scope === undefined
        ? null
        : createHash('sha256').update(JSON.stringify(input.scopes)).digest('hex'),
  });
  return { ...input, fence, origin };
}
function authorizeImage(
  options: ImageAuthorityOptions,
  principal: ImagePrincipal,
  effect: ImageEffect,
  chatId: string,
): void {
  validatePrincipal(options.store, principal, chatId);
  validateFence(options, principal);
  if (effect === 'read') return;
  if (effect === 'wait') {
    admitImageWait(options.store, chatId, principal.scopes);
    return;
  }
  if (chatId === '') throw new ApiError('forbidden', 'Image spend requires a specific owned chat.');
  admitImageTools(options.store, principal, chatId);
  if (effect === 'persist') return;
  if (!options.configured())
    throw new ImageAdmissionError(
      'not_configured',
      'The OpenRouter image-provider key is not configured.',
    );
  options.spend(imageBackground(options.store, principal, chatId));
}
function validatePrincipal(store: Store, principal: ImagePrincipal, chatId: string): void {
  store.profiles.byId(principal.profileId);
  if (principal.caller.kind === 'client') {
    const current = store.clients.byId(principal.caller.client.id);
    if (store.profiles.activeOf(current.id).id !== principal.profileId)
      throw new ApiError('forbidden', 'The initiating app changed its active profile.');
  }
  for (const scope of principal.scopes) {
    validateExecutionAuthority(store, scope);
    if (scope.profile_id !== principal.profileId)
      throw new ApiError(
        'forbidden',
        'The image operation changed its initiating execution profile.',
      );
  }
  if (chatId === '') return;
  if (store.aiChats.chat(chatId).profile_id !== principal.profileId)
    throw new ApiError('forbidden', 'This image chat belongs to another profile.');
  const initiatingChat = principal.caller.chatId;
  if (initiatingChat !== undefined && initiatingChat !== null && initiatingChat !== chatId)
    throw new ApiError('forbidden', 'An image tool cannot leave its initiating chat.');
}
function nativeFence(
  options: ImageAuthorityOptions,
  profileId: string,
  chatId: string,
): NativeImageFence | null {
  const engine = options.store.aiChats.chat(chatId).engine;
  if (engine.kind !== 'dsh' || engine.session_id === null) return null;
  const writer = options.store.dshSessions.writerState(engine.session_id, profileId);
  if (writer.state !== 'active' || writer.claim === null)
    throw new ApiError('forbidden', 'The initiating native image tool has no active writer lease.');
  return {
    sessionId: engine.session_id,
    epoch: writer.claim.epoch,
    token: writer.claim.token,
    runtimeInstance: writer.claim.runtime_instance,
    connectionGeneration: writer.claim.connection_generation,
  };
}
function validateFence(options: ImageAuthorityOptions, principal: ImagePrincipal): void {
  const fence = principal.fence;
  if (fence === null) return;
  const writer = options.store.dshSessions.writerState(fence.sessionId, principal.profileId);
  const claim = writer.claim;
  if (
    writer.state !== 'active' ||
    claim?.epoch !== fence.epoch ||
    claim.token !== fence.token ||
    claim.runtime_instance !== fence.runtimeInstance ||
    claim.connection_generation !== fence.connectionGeneration ||
    Date.parse(claim.expires_at) <= options.now().getTime()
  )
    throw new ApiError(
      'forbidden',
      'The initiating native image tool lost its writer lease or epoch.',
    );
}

function initiatingFence(
  options: ImageAuthorityOptions,
  principal: Pick<ImagePrincipal, 'caller' | 'profileId' | 'scopes'>,
): NativeImageFence | null {
  const chatId = principal.caller.chatId;
  if (principal.scopes.length === 0 || chatId === undefined || chatId === null) return null;
  return nativeFence(options, principal.profileId, chatId);
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
  if (store.settings.read().mcp_disabled_tools.includes(IMAGE_SPEND_TOOL))
    throw new ImageAdmissionError(
      'tool_disabled',
      'The metered image-operation tool is disabled in this home.',
    );
}
