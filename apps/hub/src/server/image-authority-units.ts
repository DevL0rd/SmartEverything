import { ApiError, type ImageProviderReadiness } from '@smarteverything/domain';
import { effectiveTools } from '../assistant/tool-scope';
import type { ImageEffect } from '../assistant/image/contract';
import type { ConversationAuthority } from '../harness/authority-contract';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';

const IMAGE_SPEND_TOOL = 'image_gen';

export interface ImageAuthorityCheck {
  readonly profileId: string;
  readonly chatId: string;
  readonly effect: ImageEffect;
  readonly initiatingChat: string | null;
  readonly callerService: boolean;
  readonly scopes: readonly Pick<ConversationAuthority, 'kind' | 'tools'>[];
}

export interface ImageRefused {
  readonly reason: Exclude<ImageProviderReadiness['reason'], null>;
  readonly detail: string;
}

export type ImageAuthorityAnswer =
  | { readonly kind: 'admitted'; readonly background: boolean }
  | { readonly kind: 'refused'; readonly refused: ImageRefused };

function toolEnabledRefusal(store: HostStore): ImageRefused | null {
  return store.settings.read().mcp_disabled_tools.includes(IMAGE_SPEND_TOOL)
    ? {
        reason: 'tool_disabled',
        detail: 'The metered image-operation tool is disabled in this home.',
      }
    : null;
}

function toolsRefusal(store: HostStore, check: ImageAuthorityCheck): ImageRefused | null {
  const tools = effectiveTools(store, store.aiChats.chat(check.chatId));
  if (tools !== null && !tools.includes(IMAGE_SPEND_TOOL))
    return {
      reason: 'grant_required',
      detail: 'This chat’s tool grant does not allow the metered image operation.',
    };
  for (const scope of check.scopes) {
    if (scope.tools !== null && !scope.tools.includes(IMAGE_SPEND_TOOL))
      return {
        reason: 'grant_required',
        detail: 'The initiating execution tool grant does not allow the metered image operation.',
      };
  }
  return toolEnabledRefusal(store);
}

function answerOf(refused: ImageRefused | null, background: boolean): ImageAuthorityAnswer {
  return refused === null ? { kind: 'admitted', background } : { kind: 'refused', refused };
}

export const IMAGE_AUTHORITY_UNIT = storeUnit(
  (store, check: ImageAuthorityCheck): ImageAuthorityAnswer => {
    store.profiles.byId(check.profileId);
    const { chatId, effect } = check;
    if (chatId !== '') {
      store.aiChats.chat(chatId);
      if (check.initiatingChat !== null && check.initiatingChat !== chatId)
        throw new ApiError('forbidden', 'An image tool cannot leave its initiating chat.');
    }
    if (effect === 'read') return answerOf(null, false);
    if (chatId === '')
      throw new ApiError('forbidden', 'Image spend requires a specific owned chat.');
    if (effect === 'persist') return answerOf(toolEnabledRefusal(store), false);
    return answerOf(
      toolsRefusal(store, check),
      check.callerService ||
        store.aiChats.chat(chatId).kind === 'subagent' ||
        check.scopes.some((scope) => scope.kind === 'service'),
    );
  },
);
