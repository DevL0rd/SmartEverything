import {
  ApiError,
  COMPUTER_AI_RUNTIME,
  COMPUTER_NATIVE_MCP_POLICY,
  COMPUTER_MCP_GRANT_PATH,
  COMPUTER_MCP_GRANT_REQUEST,
  COMPUTER_MCP_GRANT_RESPONSE,
} from '@smarteverything/domain';
import { manageComputerMcpGrant } from '../../computers/node-mcp-grant';
import { bearerOf, parseJsonBody, readBody, sendJson } from '../http';
import type { ServerContext } from '../context';
import type { RawRoute } from '../http-server';

const GRANT_BODY_LIMIT = 4096;
export function computerMcpGrantRoute(context: ServerContext, runtimePath = false): RawRoute {
  return {
    method: 'POST',
    path: runtimePath ? '/api/nodes/ai/:runtime/grant' : COMPUTER_MCP_GRANT_PATH,
    handle: async (request, response, params): Promise<void> => {
      const runtime = runtimePath ? COMPUTER_AI_RUNTIME.parse(params['runtime']) : 'claude';
      const node = context.computerNodes.authenticate(bearerOf(request));
      const parsed = COMPUTER_MCP_GRANT_REQUEST.safeParse(
        parseJsonBody(request, await readBody(request, GRANT_BODY_LIMIT)),
      );
      if (!parsed.success)
        throw new ApiError(
          'invalid_request',
          'Expected a computer-scoped MCP grant issue, verify or revoke request.',
        );
      sendJson(
        response,
        200,
        COMPUTER_MCP_GRANT_RESPONSE.parse(
          manageComputerMcpGrant(context.store, node, parsed.data, runtime),
        ),
      );
    },
  };
}

export function computerMcpPolicyRoute(context: ServerContext): RawRoute {
  return {
    method: 'GET',
    path: '/api/nodes/ai/:runtime/mcp-policy',
    handle: (request, response, params): Promise<void> => {
      const runtime = COMPUTER_AI_RUNTIME.parse(params['runtime']);
      const node = context.computerNodes.authenticate(bearerOf(request));
      sendJson(
        response,
        200,
        COMPUTER_NATIVE_MCP_POLICY.parse(
          context.store.computerNativeMcpPolicy.read({ device_id: node.device_id, runtime }),
        ),
      );
      return Promise.resolve();
    },
  };
}
