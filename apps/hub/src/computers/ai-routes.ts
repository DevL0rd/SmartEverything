import {
  API_ENDPOINTS as E,
  CLAUDE_STATUS,
  CLAUDE_PROVIDER_OPTIONS,
  COMPUTER_AI_CAPABILITIES,
  PROVIDER_METADATA,
  type COMPUTER_AI_ENDPOINTS,
} from '@smarteverything/domain';
import { z } from 'zod';
import { externalChatRetired } from './external-chat';
import type { ComputerAiDirectory } from './ai-directory';
import { bound, type Routes } from '../server/router';
import { roleOfCaller } from '../server/auth';

export function computerAiRoutes(
  directory: ComputerAiDirectory,
): Routes<
  Exclude<
    keyof typeof COMPUTER_AI_ENDPOINTS,
    'readComputerNativeMcpPolicy' | 'updateComputerNativeMcpPolicy'
  >
> {
  return {
    ...settingsRoutes(directory),
    ...providerDiscoveryRoutes(directory),
    ...retiredSessionRoutes,
    readComputerClaudeUsage: bound(E.readComputerClaudeUsage, ({ params }) =>
      directory.request(
        params.deviceId,
        { operation: 'usage' },
        E.readComputerClaudeUsage.response,
      ),
    ),
    removeComputerClaudeLink: bound(E.removeComputerClaudeLink, ({ params }) =>
      directory.request(
        params.deviceId,
        { operation: 'remove_link' },
        E.removeComputerClaudeLink.response,
      ),
    ),
  };
}

function settingsRoutes(
  directory: ComputerAiDirectory,
): Routes<'readComputerAi' | 'updateComputerAi' | 'readComputerClaudeStatus'> {
  return {
    readComputerAi: bound(E.readComputerAi, ({ params, caller }) => {
      const status = directory.status(params.deviceId);
      return roleOfCaller(caller) === 'owner'
        ? status
        : {
            ...status,
            settings: {
              control: {
                enabled: status.settings.control.enabled,
                auto_link: false,
                mcp_areas: null,
              },
              provider: {
                enabled: status.settings.provider.enabled,
                options: CLAUDE_PROVIDER_OPTIONS.parse({}),
              },
            },
          };
    }),
    updateComputerAi: bound(E.updateComputerAi, ({ params, body }) =>
      directory.update(params.deviceId, body),
    ),
    readComputerClaudeStatus: bound(E.readComputerClaudeStatus, async ({ params }) => {
      const response = await directory.request(
        params.deviceId,
        { operation: 'status' },
        z.strictObject({ native: CLAUDE_STATUS, capabilities: COMPUTER_AI_CAPABILITIES }),
      );
      return response.native;
    }),
  };
}

function providerDiscoveryRoutes(
  directory: ComputerAiDirectory,
): Routes<'listComputerClaudeModels' | 'readComputerClaudeProviderMetadata'> {
  return {
    listComputerClaudeModels: bound(E.listComputerClaudeModels, ({ params }) =>
      directory.models(params.deviceId),
    ),
    readComputerClaudeProviderMetadata: bound(E.readComputerClaudeProviderMetadata, ({ params }) =>
      directory.request(params.deviceId, { operation: 'provider_metadata' }, PROVIDER_METADATA),
    ),
  };
}

const retiredSessionRoutes = {
  readComputerClaudeOperation: bound(E.readComputerClaudeOperation, externalChatRetired),
  listComputerClaudeSessions: bound(E.listComputerClaudeSessions, externalChatRetired),
  readComputerClaudeSession: bound(E.readComputerClaudeSession, externalChatRetired),
  listComputerClaudeThread: bound(E.listComputerClaudeThread, externalChatRetired),
  listComputerClaudePrompts: bound(E.listComputerClaudePrompts, externalChatRetired),
  controlComputerClaudeSession: bound(E.controlComputerClaudeSession, externalChatRetired),
  startComputerClaudeSession: bound(E.startComputerClaudeSession, externalChatRetired),
  installComputerClaudeLink: bound(E.installComputerClaudeLink, externalChatRetired),
  registerComputerClaudeController: bound(E.registerComputerClaudeController, externalChatRetired),
  removeComputerClaudeController: bound(E.removeComputerClaudeController, externalChatRetired),
  answerComputerClaudePrompt: bound(E.answerComputerClaudePrompt, externalChatRetired),
  listComputerClaudeTools: bound(E.listComputerClaudeTools, externalChatRetired),
  callComputerClaudeTool: bound(E.callComputerClaudeTool, externalChatRetired),
} as const;
