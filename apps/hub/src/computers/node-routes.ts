import {
  API_ENDPOINTS as E,
  ApiError,
  type COMPUTER_NODE_ENDPOINTS,
} from '@smarteverything/domain';
import { clientOf } from '../server/auth';
import type { ServerContext } from '../server/context';
import { bound, type Routes, DONE_REPLY } from '../server/router';

function pinOf(url: string, connections: ServerContext['connections']): string | null {
  if (new URL(url).protocol !== 'https:') return null;
  if (connections === undefined)
    throw new ApiError('conflict', 'This hub has no configured connection identity.');
  return connections.publicIdentity().identity.id;
}

export function computerNodeRoutes(
  context: Pick<
    ServerContext,
    'computerNodes' | 'nodeSockets' | 'harnessSockets' | 'connections' | 'live'
  >,
): Routes<keyof typeof COMPUTER_NODE_ENDPOINTS> {
  const { computerNodes: access, nodeSockets: sockets, harnessSockets: harness } = context;
  const drop = (deviceId: string, windowClient: string | null): void => {
    if (windowClient !== null) context.live.closeClient(windowClient);
    sockets.revoke(deviceId);
    harness.revoke(deviceId);
  };
  return {
    pairComputerNode: bound(E.pairComputerNode, ({ body, caller }) => ({
      ...access.pair(body.url, clientOf(caller).id),
      pin: pinOf(body.url, context.connections),
    })),
    claimComputerNode: bound(E.claimComputerNode, ({ body, remote }) => {
      const { paired, replacedWindow } = access.claim(body.code, body.hello, remote);
      drop(paired.device_id, replacedWindow);
      return paired;
    }),
    revokeComputerNode: bound(E.revokeComputerNode, ({ params }) => {
      drop(params.deviceId, access.revoke(params.deviceId));
      return DONE_REPLY;
    }),
  };
}
