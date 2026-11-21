import { createHash } from 'node:crypto';
import {
  ApiError,
  IMAGE_OPERATION_ORIGIN,
  type ImageOperationOrigin,
} from '@smarteverything/domain';
import { currentExecutionAuthority } from '../assistant/turn-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { ImageActor, ImageEffect } from '../assistant/image/contract';
import type { Budget } from '../ledger/budget';
import type { Store } from '../store/store';
import { profileIdOf, type Caller } from './auth';
import { ImageAdmissionError } from './image-admission';

export interface ImageSpend {
  readonly background: boolean;
  readonly profileId: string;
}
export function imageSpendCheck(gate: Budget['gate']): (spend: ImageSpend) => void {
  return (spend): void => {
    gate.check('image', {
      profileId: spend.profileId,
      ...(spend.background ? { background: true as const } : {}),
    });
  };
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
export async function imageActorOf(
  options: ImageAuthorityOptions,
  caller: Caller,
): Promise<ImageActor> {
  if (caller.kind !== 'client' && caller.kind !== 'service')
    throw new ApiError(
      'forbidden',
      'Image operations require an authenticated initiating profile.',
    );
  const profileId = profileIdOf(caller);
  const scopes = [
    ...new Map(
      [caller.kind === 'service' ? caller.authority : undefined, currentExecutionAuthority()]
        .filter((scope): scope is ConversationAuthority => scope !== undefined)
        .map((scope) => [scope.event_id, scope] as const),
    ).values(),
  ];
  const principal = imagePrincipal({ caller, profileId, scopes });
  await authorizeImage(options, principal, 'read', '');
  return {
    profileId,
    key: principal.origin.principal_id,
    origin: principal.origin,
    authorize: (effect, chatId): Promise<void> =>
      authorizeImage(options, principal, effect, chatId),
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
async function authorizeImage(
  options: ImageAuthorityOptions,
  principal: ImagePrincipal,
  effect: ImageEffect,
  chatId: string,
): Promise<void> {
  const initiatingChat = principal.caller.chatId;
  const answer = await options.store.host.read('imageAuthority', {
    profileId: principal.profileId,
    chatId,
    effect,
    initiatingChat: initiatingChat ?? null,
    callerService: principal.caller.kind === 'service',
    scopes: principal.scopes.map((scope) => ({ kind: scope.kind, tools: scope.tools })),
  });
  if (answer.kind === 'refused')
    throw new ImageAdmissionError(answer.refused.reason, answer.refused.detail);
  if (effect === 'read' || effect === 'persist') return;
  if (!options.configured())
    throw new ImageAdmissionError(
      'not_configured',
      'The OpenRouter image-provider key is not configured.',
    );
  options.spend({ background: answer.background, profileId: principal.profileId });
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
