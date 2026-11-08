import { ApiError, API_ENDPOINTS } from '@smarteverything/domain';
import { admitChatExecution } from '../../assistant/native-helpers';
import type { ChatDirectory } from '../../assistant/chat-directory';
import type { ComputerProviders } from '../../assistant/computer-providers';
import type { Store } from '../../store/store';
import { bound } from '../router';
import { directClient, profileIdOf, type Caller } from '../auth';
export interface NativeCommandContext {
  readonly store: Store;
  readonly assistant: {
    readonly chats: Pick<ChatDirectory, 'own'>;
    readonly computerProviders: Pick<ComputerProviders, 'get'>;
  };
}

export const nativeCommandRoutes = (context: NativeCommandContext) =>
  ({
    listAiChatNativeCommands: bound(
      API_ENDPOINTS.listAiChatNativeCommands,
      ({ params, caller }) => {
        const { chat, commands, clientId } = owned(context, caller, params.chatId);
        return commands.list(chat, clientId);
      },
    ),
    executeAiChatNativeCommand: bound(
      API_ENDPOINTS.executeAiChatNativeCommand,
      ({ params, caller, body }) => {
        const { chat, commands, clientId } = owned(context, caller, params.chatId);
        if (
          body.scope.client_id !== clientId ||
          body.scope.profile_id !== chat.profile_id ||
          body.scope.chat_id !== chat.id
        )
          throw new ApiError(
            'forbidden',
            'The native command names a different owner, client or chat.',
          );
        return commands.execute(chat, body);
      },
    ),
    readAiChatNativeCommandReceipt: bound(
      API_ENDPOINTS.readAiChatNativeCommandReceipt,
      ({ params, caller }) => {
        const { chat, commands, clientId } = owned(context, caller, params.chatId);
        return commands.read(chat, params.operationId, clientId);
      },
    ),
  }) as const;
function owned(
  context: NativeCommandContext,
  caller: Caller,
  chatId: string,
): {
  readonly chat: ReturnType<ChatDirectory['own']>;
  readonly commands: NonNullable<ReturnType<ComputerProviders['get']>>['commands'];
  readonly clientId: string;
} {
  const client = directClient(caller);
  if (client === undefined)
    throw new ApiError(
      'forbidden',
      'Native commands require the owner’s direct authenticated app request.',
    );
  const chat = context.assistant.chats.own(
    { profileId: profileIdOf(context.store, caller), role: 'owner' },
    chatId,
  );
  admitChatExecution(chat);
  if (chat.engine.kind !== 'codex' && chat.engine.kind !== 'claude')
    throw new ApiError(
      'conflict',
      'This native command adapter is unavailable for the selected runtime.',
    );
  const runner = context.assistant.computerProviders.get(chat.engine.kind);
  if (runner === undefined) throw new ApiError('conflict', 'The native provider is starting.');
  return { chat, commands: runner.commands, clientId: client.id };
}
