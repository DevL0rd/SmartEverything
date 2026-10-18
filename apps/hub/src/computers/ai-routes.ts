import { randomUUID } from 'node:crypto';
import {
  API_ENDPOINTS as E,
  CLAUDE_STATUS,
  CLAUDE_PROVIDER_OPTIONS,
  COMPUTER_AI_CAPABILITIES,
  PROVIDER_METADATA,
  type COMPUTER_AI_ENDPOINTS,
} from '@smarteverything/domain';
import { z } from 'zod';
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
    readComputerClaudeOperation: bound(E.readComputerClaudeOperation, ({ params, caller }) =>
      directory.nativeRequest(
        params.deviceId,
        { operation: 'native_operation', operation_id: params.operationId },
        E.readComputerClaudeOperation.response,
        caller,
      ),
    ),
    ...settingsRoutes(directory),
    ...providerDiscoveryRoutes(directory),
    ...sessionReadRoutes(directory),
    ...promptReadRoutes(directory),
    ...sessionActionRoutes(directory),
    ...linkRoutes(directory),
    ...promptAndToolRoutes(directory),
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

function sessionReadRoutes(
  directory: ComputerAiDirectory,
): Routes<'listComputerClaudeSessions' | 'readComputerClaudeSession' | 'listComputerClaudeThread'> {
  return {
    listComputerClaudeSessions: bound(E.listComputerClaudeSessions, ({ params, query }) =>
      directory.request(
        params.deviceId,
        { operation: 'sessions', query },
        E.listComputerClaudeSessions.response,
      ),
    ),
    readComputerClaudeSession: bound(E.readComputerClaudeSession, ({ params }) =>
      directory.request(
        params.deviceId,
        { operation: 'session', session_id: params.sessionId },
        E.readComputerClaudeSession.response,
      ),
    ),
    listComputerClaudeThread: bound(E.listComputerClaudeThread, ({ params, query }) =>
      directory.request(
        params.deviceId,
        { operation: 'thread', session_id: params.sessionId, query },
        E.listComputerClaudeThread.response,
      ),
    ),
  };
}

function promptReadRoutes(
  directory: ComputerAiDirectory,
): Routes<'readComputerClaudeUsage' | 'listComputerClaudePrompts'> {
  return {
    readComputerClaudeUsage: bound(E.readComputerClaudeUsage, ({ params }) =>
      directory.request(
        params.deviceId,
        { operation: 'usage' },
        E.readComputerClaudeUsage.response,
      ),
    ),
    listComputerClaudePrompts: bound(E.listComputerClaudePrompts, ({ params, query }) =>
      directory.request(
        params.deviceId,
        {
          operation: 'prompts',
          ...(query.sessionId === undefined ? {} : { session_id: query.sessionId }),
        },
        E.listComputerClaudePrompts.response,
      ),
    ),
  };
}

function sessionActionRoutes(
  directory: ComputerAiDirectory,
): Routes<'controlComputerClaudeSession' | 'startComputerClaudeSession'> {
  return {
    controlComputerClaudeSession: bound(
      E.controlComputerClaudeSession,
      ({ params, body, caller }) => {
        const { operation_id, ...control } = body;
        return directory.nativeRequest(
          params.deviceId,
          {
            operation: 'control',
            session_id: params.sessionId,
            control,
            operation_id: operation_id ?? randomUUID(),
          },
          E.controlComputerClaudeSession.response,
          caller,
        );
      },
    ),
    startComputerClaudeSession: bound(E.startComputerClaudeSession, ({ params, body, caller }) => {
      const { operation_id, ...start } = body;
      return directory.nativeRequest(
        params.deviceId,
        {
          operation: 'start',
          start,
          operation_id: operation_id ?? randomUUID(),
        },
        E.startComputerClaudeSession.response,
        caller,
      );
    }),
  };
}

function linkRoutes(
  directory: ComputerAiDirectory,
): Routes<
  | 'installComputerClaudeLink'
  | 'removeComputerClaudeLink'
  | 'registerComputerClaudeController'
  | 'removeComputerClaudeController'
> {
  return {
    installComputerClaudeLink: bound(E.installComputerClaudeLink, ({ params }) =>
      directory.request(
        params.deviceId,
        { operation: 'install_link' },
        E.installComputerClaudeLink.response,
      ),
    ),
    removeComputerClaudeLink: bound(E.removeComputerClaudeLink, ({ params }) =>
      directory.request(
        params.deviceId,
        { operation: 'remove_link' },
        E.removeComputerClaudeLink.response,
      ),
    ),
    registerComputerClaudeController: bound(E.registerComputerClaudeController, ({ params }) =>
      directory.request(
        params.deviceId,
        { operation: 'register_controller' },
        E.registerComputerClaudeController.response,
      ),
    ),
    removeComputerClaudeController: bound(E.removeComputerClaudeController, ({ params }) =>
      directory.request(
        params.deviceId,
        { operation: 'remove_controller' },
        E.removeComputerClaudeController.response,
      ),
    ),
  };
}

function promptAndToolRoutes(
  directory: ComputerAiDirectory,
): Routes<'answerComputerClaudePrompt' | 'listComputerClaudeTools' | 'callComputerClaudeTool'> {
  return {
    answerComputerClaudePrompt: bound(E.answerComputerClaudePrompt, ({ params, body, caller }) =>
      directory.request(
        params.deviceId,
        {
          operation: 'answer',
          prompt_id: params.promptId,
          answer: body,
          requester: caller.kind === 'client' && caller.via === 'assistant' ? 'ai' : 'owner',
        },
        E.answerComputerClaudePrompt.response,
      ),
    ),
    listComputerClaudeTools: bound(E.listComputerClaudeTools, ({ params, query }) =>
      directory.request(
        params.deviceId,
        {
          operation: 'native_tools_list',
          ...(query.sessionId === undefined ? {} : { session_id: query.sessionId }),
        },
        E.listComputerClaudeTools.response,
      ),
    ),
    callComputerClaudeTool: bound(E.callComputerClaudeTool, ({ params, body, caller }) =>
      directory.nativeRequest(
        params.deviceId,
        {
          operation: 'native_tools_call',
          session_id: params.sessionId,
          ...body,
          operation_id: body.operation_id ?? randomUUID(),
        },
        E.callComputerClaudeTool.response,
        caller,
      ),
    ),
  };
}
