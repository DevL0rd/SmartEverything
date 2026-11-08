import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { externalChatRetired } from '../../computers/external-chat';
import { bound } from '../router';

export const claudeCliRoutes = {
  startClaudeCliSession: bound(E.startClaudeCliSession, externalChatRetired),
  listClaudeCliSessions: bound(E.listClaudeCliSessions, externalChatRetired),
  readClaudeCliSession: bound(E.readClaudeCliSession, externalChatRetired),
  readClaudeCliHistory: bound(E.readClaudeCliHistory, externalChatRetired),
  controlClaudeCliSession: bound(E.controlClaudeCliSession, externalChatRetired),
  readClaudeCliOperation: bound(E.readClaudeCliOperation, externalChatRetired),
  readClaudeCliPrompts: bound(E.readClaudeCliPrompts, externalChatRetired),
  answerClaudeCliPrompt: bound(E.answerClaudeCliPrompt, externalChatRetired),
} as const;
