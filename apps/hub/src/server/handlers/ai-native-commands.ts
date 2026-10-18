import { ApiError, API_ENDPOINTS } from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { bound } from '../router';
import { clientOf, profileIdOf, type Caller } from '../auth';
export const nativeCommandRoutes = (context: ServerContext) =>
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
  context: ServerContext,
  caller: Caller,
  chatId: string,
): {
  readonly chat: ReturnType<ServerContext['assistant']['chats']['own']>;
  readonly commands: NonNullable<
    ReturnType<ServerContext['assistant']['computerProviders']['get']>
  >['commands'];
  readonly clientId: string;
} {
  if (
    caller.kind !== 'client' ||
    caller.via !== undefined ||
    caller.pluginId !== undefined ||
    caller.pluginRequester !== undefined
  )
    throw new ApiError(
      'forbidden',
      'Native commands require the owner’s direct authenticated app request.',
    );
  const chat = context.assistant.chats.own(
    { profileId: profileIdOf(context.store, caller), role: 'owner' },
    chatId,
  );
  if (chat.engine.kind !== 'codex' && chat.engine.kind !== 'claude')
    throw new ApiError(
      'conflict',
      'This native command adapter is unavailable for the selected runtime.',
    );
  const runner = context.assistant.computerProviders.get(chat.engine.kind);
  if (runner === undefined) throw new ApiError('conflict', 'The native provider is starting.');
  return { chat, commands: runner.commands, clientId: clientOf(caller).id };
}
