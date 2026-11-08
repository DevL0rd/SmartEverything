import { API_ENDPOINTS, ApiError, type ClientRow } from '@smarteverything/domain';
import { listHarnessCommands, executeHarnessCommand } from '../../harness/commands';
import type { HarnessService } from '../../harness/service';
import { bound } from '../router';
import { chatOwnerOf, directClient } from '../auth';
import type { ChatOwner } from '../../assistant/chat-directory';
import type { Caller } from '../auth';

export const harnessCommandRoutes = (service: HarnessService) =>
  ({
    listAiChatHarnessCommands: bound(
      API_ENDPOINTS.listAiChatHarnessCommands,
      ({ params, body, caller }) => {
        const client = humanClient(caller);
        return listHarnessCommands(
          service,
          { owner: ownerOf(service, caller), chatId: params.chatId, clientId: client.id },
          body,
        );
      },
    ),
    executeAiChatHarnessCommand: bound(
      API_ENDPOINTS.executeAiChatHarnessCommand,
      ({ params, body, caller }) => {
        const client = humanClient(caller);
        return executeHarnessCommand(
          service,
          { owner: ownerOf(service, caller), chatId: params.chatId, clientId: client.id },
          body,
        );
      },
    ),
  }) as const;

function humanClient(caller: Caller): ClientRow {
  const client = directClient(caller);
  if (client === undefined)
    throw new ApiError(
      'forbidden',
      'Slash commands require the person’s direct authenticated app request.',
    );
  return client;
}

function ownerOf(service: HarnessService, caller: Caller): ChatOwner {
  return chatOwnerOf(service.store, caller);
}
