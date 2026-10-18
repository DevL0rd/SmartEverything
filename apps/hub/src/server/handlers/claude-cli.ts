import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { ManagedClaudeService } from '../../claude/managed-service';
import {
  ownedClaudeScope,
  currentClaudeActor,
  expectedClaudeScope,
  type ManagedClaudeActor,
  type ManagedClaudeContext,
} from '../../claude/managed-scope';
import { clientOf, profileIdOf, type Caller } from '../auth';
import { bound, DONE_REPLY } from '../router';
import { wireMessages } from '../../assistant/wire-message';

function actorOf(context: ManagedClaudeContext, caller: Caller): ManagedClaudeActor {
  if (
    caller.kind !== 'client' ||
    caller.pluginId !== undefined ||
    caller.pluginRequester !== undefined
  )
    throw new ApiError(
      'forbidden',
      'Managed Claude CLI sessions require an authenticated owner app or scoped owner AI request.',
    );
  admitAssistant(caller);
  const client = clientOf(caller);
  const actor: ManagedClaudeActor = {
    profileId: profileIdOf(context.store, caller),
    role: 'owner',
    clientId: client.id,
    ...(caller.authority === undefined ? {} : { authority: caller.authority }),
  };
  currentClaudeActor(context, actor);
  return actor;
}
function admitAssistant(caller: Extract<Caller, { kind: 'client' }>): void {
  if (
    caller.via === 'assistant' &&
    (caller.mcpOrigin === 'computer' ||
      (caller.mcpOrigin !== 'personal' &&
        caller.mcpOrigin !== 'oauth' &&
        caller.authority === undefined))
  )
    throw new ApiError(
      'forbidden',
      'CLI ownership requires website authentication or initiating owner chat authority.',
    );
}
export const claudeCliRoutes = (context: ManagedClaudeContext) =>
  sessionRoutes(context, new ManagedClaudeService(context));

const sessionRoutes = (context: ManagedClaudeContext, service: ManagedClaudeService) =>
  ({
    startClaudeCliSession: bound(E.startClaudeCliSession, ({ params, body, caller }) => {
      const actor = actorOf(context, caller);
      return service.start(actor, params.deviceId, body);
    }),
    listClaudeCliSessions: bound(E.listClaudeCliSessions, ({ params, query, caller }) =>
      service.list(actorOf(context, caller), params.deviceId, query.archived, query.limit),
    ),
    readClaudeCliSession: bound(E.readClaudeCliSession, ({ params, caller }) =>
      service.read(actorOf(context, caller), params.deviceId, params.chatId),
    ),
    readClaudeCliHistory: bound(E.readClaudeCliHistory, ({ params, query, caller }) => {
      ownedClaudeScope(context, actorOf(context, caller), params.deviceId, params.chatId);
      return wireMessages(context.assistant.messages(params.chatId, query.before, query.limit));
    }),
    controlClaudeCliSession: bound(E.controlClaudeCliSession, ({ params, body, caller }) =>
      service.control(actorOf(context, caller), params.deviceId, params.chatId, body),
    ),
    ...promptRoutes(context),
    readClaudeCliOperation: bound(E.readClaudeCliOperation, ({ params, caller }) => {
      const actor = actorOf(context, caller);
      currentClaudeActor(context, actor);
      const receipt = context.store.claudeCliOperations.read(
        params.operationId,
        actor.profileId,
        params.deviceId,
      );
      return receipt;
    }),
  }) as const;

const promptRoutes = (context: ManagedClaudeContext) =>
  ({
    readClaudeCliPrompts: bound(E.readClaudeCliPrompts, ({ params, caller }) => {
      const scope = ownedClaudeScope(
        context,
        actorOf(context, caller),
        params.deviceId,
        params.chatId,
      );
      const state = scope.runner.state.read(scope.chat);
      if (state.runtime !== 'claude')
        throw new ApiError('conflict', 'This owned prompt list has a different native runtime.');
      return state.prompts;
    }),
    answerClaudeCliPrompt: bound(E.answerClaudeCliPrompt, async ({ params, body, caller }) => {
      const scope = ownedClaudeScope(
        context,
        actorOf(context, caller),
        params.deviceId,
        params.chatId,
      );
      expectedClaudeScope(context, scope, body);
      await scope.runner.state.answer(scope.chat, params.promptId, body.answer);
      return DONE_REPLY;
    }),
  }) as const;
