import {
  ApiError,
  assistantLabel,
  type AiChatRow,
  type AssistantReaction,
  type AssistantReactionActor,
  type AssistantReactionChange,
} from '@smarteverything/domain';
import { chatOwnerOf, type Caller } from '../server/auth';
import type { Store } from '../store/store';
import type { ChatDirectory } from './chat-directory';
import type { EngineRegistry } from './engines/registry';
import type { ConversationAuthority } from '../harness/authority-contract';
import { parentReactionTarget } from './parent-reaction-target';
import { mutableChat } from './remove-messages';

interface ReactionAdmission {
  readonly store: Store;
  readonly chats: ChatDirectory;
  readonly engines: EngineRegistry;
}

interface ReactionActor {
  readonly actor: AssistantReactionActor;
  readonly authority?: ConversationAuthority;
}

function actorOf(store: Store, caller: Caller, chat: AiChatRow): ReactionActor {
  if (caller.kind === 'anonymous')
    throw new ApiError('forbidden', 'Sign in to react to this message.');
  if (
    caller.kind === 'client' &&
    caller.via === undefined &&
    caller.pluginId === undefined &&
    caller.authority === undefined
  ) {
    const profile = store.profiles.byId(chatOwnerOf(store, caller).profileId);
    return { actor: { kind: 'person', id: profile.id, label: profile.name } };
  }
  return assistantActor(store, caller, chat);
}

function assistantActor(
  store: Store,
  caller: Exclude<Caller, { readonly kind: 'anonymous' }>,
  chat: AiChatRow,
): ReactionActor {
  if (caller.authority === undefined || caller.chatId !== chat.id)
    throw new ApiError('forbidden', 'An assistant can react only inside its admitted chat.');
  const event = store.assistantEvents.event(caller.authority.event_id);
  if (event.chat_id !== chat.id || event.profile_id !== chat.profile_id)
    throw new ApiError('forbidden', 'The conversation authority does not belong to this chat.');
  const label =
    chat.parent_id === null
      ? assistantLabel(store.assistantChat.settings())
      : (chat.helper_name ?? chat.title);
  return { actor: { kind: 'assistant', id: chat.id, label }, authority: caller.authority };
}

export function setMessageReaction(
  { store, chats, engines }: ReactionAdmission,
  caller: Caller,
  target: { readonly chatId: string; readonly messageId: string },
  change: AssistantReactionChange,
): readonly AssistantReaction[] {
  return store.write(() => {
    const chat = mutableChat(chats, engines, chatOwnerOf(store, caller), target.chatId);
    const reacting = actorOf(store, caller, chat);
    const { emoji, present, in_parent: parent } = change;
    if (parent !== true)
      return store.assistantReactions.set({ ...target, emoji, present, actor: reacting.actor });
    const projected = parentReactionTarget(
      { store, engines, chat },
      reacting.authority,
      target.messageId,
    );
    return store.assistantReactions
      .set({ ...projected, emoji, present, actor: reacting.actor })
      .filter(
        (entry) =>
          entry.emoji === emoji &&
          entry.actor.kind === reacting.actor.kind &&
          entry.actor.id === reacting.actor.id,
      );
  });
}
