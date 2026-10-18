import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { ClaudeService } from '../../claude/service';
import type { Caller } from '../auth';
import { bound } from '../router';

function requesterOf(caller: Caller): 'owner' | 'ai' {
  return caller.kind === 'client' && caller.via === 'assistant' ? 'ai' : 'owner';
}

export const claudeRoutes = (service: ClaudeService) =>
  ({
    readClaudeStatus: bound(E.readClaudeStatus, () => service.status()),
    listClaudeSessions: bound(E.listClaudeSessions, ({ query }) => service.sessions(query)),
    readClaudeSession: bound(E.readClaudeSession, ({ params }) =>
      service.session(params.sessionId),
    ),
    listClaudeThread: bound(E.listClaudeThread, ({ params, query }) =>
      service.thread(params.sessionId, query),
    ),
    readClaudeUsage: bound(E.readClaudeUsage, () => service.usage()),
    listClaudePrompts: bound(E.listClaudePrompts, ({ query }) => service.prompts(query.sessionId)),
    controlClaudeSession: bound(E.controlClaudeSession, ({ params, body }) =>
      service.control(params.sessionId, body),
    ),
    answerClaudePrompt: bound(E.answerClaudePrompt, ({ params, body, caller }) =>
      service.answer(params.promptId, body, requesterOf(caller)),
    ),
    startClaudeSession: bound(E.startClaudeSession, ({ body }) => service.startSession(body)),
    installClaudeLink: bound(E.installClaudeLink, () => service.installLink()),
    removeClaudeLink: bound(E.removeClaudeLink, () => service.removeLink()),
    registerClaudeController: bound(E.registerClaudeController, () => service.registerController()),
    removeClaudeController: bound(E.removeClaudeController, () => service.removeController()),
  }) as const;
