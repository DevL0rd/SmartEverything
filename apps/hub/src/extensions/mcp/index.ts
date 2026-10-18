import { join } from 'node:path';
import {
  API_ENDPOINTS as E,
  MCP_PATHS,
  MCP_TOOL_NAMES,
  mcpConsentPush,
} from '@smarteverything/domain';
import type { Clock } from '../../clock';
import type { ExtensionContext, RunningExtension, ServerExtension } from '../../extensions';
import type { OwnerAlerts } from '../owner-alerts';
import type { RawRoute } from '../../server/http-server';
import { DONE_REPLY, bound, type ExtensionRouteTable } from '../../server/router';
import { recordingPathIn } from '../../services';
import { COMMAND_WAIT_MS } from './command-waiter';
import { acceptsEventStream } from './event-stream';
import { ApprovalCodes } from './oauth/approval';
import { decideConsent, decideInApp, showConsent, type AuthorizeOptions } from './oauth/authorize';
import { PendingConsents } from './oauth/consents';
import { sendProblem } from './oauth/consent-page';
import { streamDecision } from './oauth/decision-stream';
import { oauthEndpoint } from './oauth/errors';
import { resourceMetadata, serverMetadata } from './oauth/metadata';
import { registerClient } from './oauth/register';
import { revokeToken } from './oauth/revoke';
import { AuthorizationSessions } from './oauth/sessions';
import { exchangeToken } from './oauth/token';
import { BodyFormatError, replyJson } from './respond';
import { siteOf, type Site } from './site';
import { ToolListFeed } from './tool-list-feed';
import { handleMcp, streamMcp, type TransportOptions } from './transport';

export interface McpOptions {
  readonly clock: Clock;
  readonly alerts: OwnerAlerts;
}

function metadataRoute(
  context: ExtensionContext,
  path: string,
  document: (site: Site) => Record<string, unknown>,
): RawRoute {
  return {
    method: 'GET',
    path,
    handle: (_request, response): Promise<void> => {
      replyJson(response, 200, document(siteOf(context.store)));
      return Promise.resolve();
    },
  };
}

function consentRoutes(authorize: AuthorizeOptions): RawRoute[] {
  return [
    {
      method: 'GET',
      path: MCP_PATHS.authorize,
      handle: (request, response) =>
        acceptsEventStream(request)
          ? streamDecision(authorize.consents, request, response)
          : showConsent(authorize, request, response),
    },
    {
      method: 'POST',
      path: MCP_PATHS.authorize,
      handle: async (request, response): Promise<void> => {
        try {
          await decideConsent(authorize, request, response);
        } catch (cause) {
          if (!(cause instanceof BodyFormatError)) {
            throw cause;
          }
          sendProblem(response, 400, cause.message);
        }
      },
    },
  ];
}

interface Parts {
  readonly authorize: AuthorizeOptions;
  readonly toolList: ToolListFeed;
}

function accessEndpoints(context: ExtensionContext, { authorize }: Parts): ExtensionRouteTable {
  const { log, store, consents } = authorize;
  return {
    createApprovalCode: bound(E.createApprovalCode, () => {
      const code = authorize.approvals.issue();
      log.info('approval_code.issued');
      return code;
    }),
    updateMcpTools: bound(E.updateMcpTools, ({ body }) => {
      const disabled = MCP_TOOL_NAMES.filter((name) => body.disabled.includes(name));
      context.log.info('mcp.tools_switched', { disabled });
      return store.settings.setDisabledMcpTools(disabled);
    }),
    listMcpConsents: bound(E.listMcpConsents, () => consents.waiting()),
    decideMcpConsent: bound(E.decideMcpConsent, ({ params, body }) => {
      decideInApp(authorize, params.consentId, body.decision);
      return DONE_REPLY;
    }),
  };
}

function oauthRoutes(context: ExtensionContext, options: McpOptions, parts: Parts): RawRoute[] {
  const { authorize } = parts;
  const tokens = {
    store: context.store,
    clock: options.clock,
    sessions: authorize.sessions,
    log: authorize.log,
  };
  return [
    metadataRoute(context, MCP_PATHS.resourceMetadata, resourceMetadata),
    metadataRoute(context, MCP_PATHS.mcpResourceMetadata, resourceMetadata),
    metadataRoute(context, MCP_PATHS.serverMetadata, serverMetadata),
    {
      method: 'POST',
      path: MCP_PATHS.register,
      handle: oauthEndpoint('invalid_client_metadata', (request, response) =>
        registerClient(context.store, options.clock, request, response),
      ),
    },
    ...consentRoutes(authorize),
    {
      method: 'POST',
      path: MCP_PATHS.token,
      handle: oauthEndpoint('invalid_request', (request, response) =>
        exchangeToken(tokens, request, response),
      ),
    },
    {
      method: 'POST',
      path: MCP_PATHS.revoke,
      handle: oauthEndpoint('invalid_request', (request, response) =>
        revokeToken(context.store, authorize.log, request, response),
      ),
    },
  ];
}

function mcpRoutes(context: ExtensionContext, options: McpOptions, parts: Parts): RawRoute[] {
  const transport: TransportOptions = {
    store: context.store,
    clock: options.clock,
    log: context.log.forArea('hub.mcp'),
    tools: {
      store: context.store,
      hub: context.hub,
      clock: options.clock,
      operations: context.operations,
      commandWaitMs: COMMAND_WAIT_MS,
      recordingPath: recordingPathIn(context.dataDirectory),
      caller: null,
      actor: null,
      assistantFiles: join(context.dataDirectory, 'assistant'),
      mediaNotes: context.mediaNotes,
    },
  };
  return [
    {
      method: 'POST',
      path: MCP_PATHS.mcp,
      handle: (request, response) => handleMcp(transport, request, response),
    },
    {
      method: 'GET',
      path: MCP_PATHS.mcp,
      handle: (request, response) => streamMcp(transport, parts.toolList, request, response),
    },
    {
      method: 'DELETE',
      path: MCP_PATHS.mcp,
      handle: (request, response) => handleMcp(transport, request, response),
    },
  ];
}

function partsOf(context: ExtensionContext, options: McpOptions): Parts {
  return {
    authorize: {
      store: context.store,
      sessions: new AuthorizationSessions(options.clock),
      approvals: new ApprovalCodes(context.store, options.clock),
      consents: new PendingConsents(options.clock, {
        announce: (notice): void => {
          context.live.announce(notice, 'owners');
        },
        requested: (request): void => {
          options.alerts.raise(mcpConsentPush(request, context.store.settings.read().home_name));
        },
      }),
      log: context.log.forArea('hub.oauth'),
    },
    toolList: new ToolListFeed(context.store, context.log.forArea('hub.mcp')),
  };
}

export function mcpExtension(options: McpOptions): ServerExtension {
  return (context): Promise<RunningExtension> => {
    const parts = partsOf(context, options);
    return Promise.resolve({
      endpoints: accessEndpoints(context, parts),
      routes: [...oauthRoutes(context, options, parts), ...mcpRoutes(context, options, parts)],
      stop: (): Promise<void> => {
        parts.authorize.consents.stop();
        parts.toolList.stop();
        return Promise.resolve();
      },
    });
  };
}
