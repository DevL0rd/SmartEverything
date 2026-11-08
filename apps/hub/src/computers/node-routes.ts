import {
  API_ENDPOINTS as E,
  ApiError,
  type COMPUTER_NODE_ENDPOINTS,
} from '@smarteverything/domain';
import { clientOf } from '../server/auth';
import type { ServerContext } from '../server/context';
import { bound, type Routes, DONE_REPLY } from '../server/router';

function pinOf(connections: ServerContext['connections']): string {
  if (connections === undefined)
    throw new ApiError('conflict', 'This hub has no configured connection identity.');
  return connections.publicIdentity().identity.id;
}

export function computerNodeRoutes(
  context: Pick<ServerContext, 'computerNodes' | 'nodeSockets' | 'harnessSockets' | 'connections'>,
): Routes<keyof typeof COMPUTER_NODE_ENDPOINTS> {
  const { computerNodes: access, nodeSockets: sockets, harnessSockets: harness } = context;
  const drop = (deviceId: string): void => {
    sockets.revoke(deviceId);
    harness.revoke(deviceId);
  };
  return {
    pairComputerNode: bound(E.pairComputerNode, ({ body, caller }) => ({
      ...access.pair(body.url, clientOf(caller).id),
      pin: pinOf(context.connections),
    })),
    claimComputerNode: bound(E.claimComputerNode, ({ body, remote }) => {
      const { paired } = access.claim(body.code, body.hello, remote, body.window_token);
      drop(paired.device_id);
      return paired;
    }),
    revokeComputerNode: bound(E.revokeComputerNode, ({ params }) => {
      access.revoke(params.deviceId);
      drop(params.deviceId);
      return DONE_REPLY;
    }),
  };
}
