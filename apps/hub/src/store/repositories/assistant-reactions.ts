import {
  ApiError,
  canReactToMessage,
  type AssistantReaction,
  type AssistantReactionActor,
  type AssistantReactionChange,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import type { StoreContext } from '../context';

export interface SetAssistantReaction extends Pick<AssistantReactionChange, 'emoji' | 'present'> {
  readonly chatId: string;
  readonly messageId: string;
  readonly actor: AssistantReactionActor;
}

interface MessageReader {
  readonly find: (id: string) => AssistantMessageRow | undefined;
  readonly message: (id: string) => AssistantMessageRow;
}

function changeMembership(context: StoreContext, input: SetAssistantReaction): number {
  const { messageId, emoji, actor } = input;
  const membership = { messageId, emoji, kind: actor.kind, actorId: actor.id };
  return input.present
    ? context.sql.run(
        'add the assistant reaction',
        `insert into assistant_reactions (message_id, emoji, actor_kind, actor_id, actor_label)
         values ($messageId, $emoji, $kind, $actorId, $label)
         on conflict (message_id, emoji, actor_kind, actor_id) do nothing`,
        { ...membership, label: actor.label },
      )
    : context.sql.run(
        'remove the assistant reaction',
        `delete from assistant_reactions
         where message_id = $messageId and emoji = $emoji and actor_kind = $kind and actor_id = $actorId`,
        membership,
      );
}

export class AssistantReactionRepository {
  constructor(
    private readonly context: StoreContext,
    private readonly messages: MessageReader,
  ) {}

  set(input: SetAssistantReaction): readonly AssistantReaction[] {
    return this.context.write(() => {
      const before = this.messages.find(input.messageId);
      if (before?.chat_id !== input.chatId)
        throw new ApiError('not_found', 'This message is no longer available in this chat.');
      if (!canReactToMessage(before))
        throw new ApiError('conflict', 'Only conversation messages can have reactions.');
      if (changeMembership(this.context, input) === 0) return before.reactions ?? [];
      const after = this.messages.message(input.messageId);
      this.context.changed('assistant_messages', 'UPDATE', after, before);
      return after.reactions ?? [];
    });
  }
}
