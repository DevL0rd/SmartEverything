import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { ClaudeService } from '../../claude/service';
import { externalChatRetired } from '../../computers/external-chat';
import { bound } from '../router';

export const claudeRoutes = (service: ClaudeService) =>
  ({
    readClaudeStatus: bound(E.readClaudeStatus, () => service.status()),
    readClaudeUsage: bound(E.readClaudeUsage, () => service.usage()),
    removeClaudeLink: bound(E.removeClaudeLink, () => service.removeLink()),
    listClaudeSessions: bound(E.listClaudeSessions, externalChatRetired),
    readClaudeSession: bound(E.readClaudeSession, externalChatRetired),
    listClaudeThread: bound(E.listClaudeThread, externalChatRetired),
    listClaudePrompts: bound(E.listClaudePrompts, externalChatRetired),
    controlClaudeSession: bound(E.controlClaudeSession, externalChatRetired),
    answerClaudePrompt: bound(E.answerClaudePrompt, externalChatRetired),
    startClaudeSession: bound(E.startClaudeSession, externalChatRetired),
    installClaudeLink: bound(E.installClaudeLink, externalChatRetired),
    registerClaudeController: bound(E.registerClaudeController, externalChatRetired),
    removeClaudeController: bound(E.removeClaudeController, externalChatRetired),
  }) as const;
