import { API_ENDPOINTS, ApiError } from '@smarteverything/domain';
import { listHarnessCommands, executeHarnessCommand } from '../../harness/commands';
import type { HarnessService } from '../../harness/service';
import { bound } from '../router';
import { clientOf, profileIdOf, roleOfCaller } from '../auth';
import type { Caller } from '../auth';

export function harnessCommandRoutes(service: HarnessService): {
  readonly listAiChatHarnessCommands: ReturnType<typeof bound>;
  readonly executeAiChatHarnessCommand: ReturnType<typeof bound>;
} {
  return {
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
  };
}

function humanClient(caller: Caller): ReturnType<typeof clientOf> {
  if (
    caller.kind !== 'client' ||
    caller.via !== undefined ||
    caller.pluginId !== undefined ||
    caller.pluginRequester !== undefined
  )
    throw new ApiError(
      'forbidden',
      'Slash commands require the person’s direct authenticated app request.',
    );
  return clientOf(caller);
}

function ownerOf(
  service: HarnessService,
  caller: Caller,
): {
  readonly profileId: string;
  readonly role: 'owner' | 'member';
} {
  return { profileId: profileIdOf(service.store, caller), role: roleOfCaller(caller) };
}
