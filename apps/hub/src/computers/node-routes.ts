import { API_ENDPOINTS as E, type COMPUTER_NODE_ENDPOINTS } from '@smarteverything/domain';
import { clientOf } from '../server/auth';
import { bound, type Bound, DONE_REPLY } from '../server/router';
import type { ComputerNodeSockets } from '../server/node-socket';
import type { ComputerNodeAccess } from './node-access';

export function computerNodeRoutes(
  access: ComputerNodeAccess,
  sockets: ComputerNodeSockets,
  harness?: { readonly revoke: (deviceId: string) => void },
): Record<keyof typeof COMPUTER_NODE_ENDPOINTS, Bound> {
  return {
    pairComputerNode: bound(E.pairComputerNode, ({ body, caller }) =>
      access.pair(body.url, clientOf(caller).id),
    ),
    claimComputerNode: bound(E.claimComputerNode, ({ body, remote }) =>
      access.claim(body.code, body.hello, remote),
    ),
    revokeComputerNode: bound(E.revokeComputerNode, ({ params }) => {
      sockets.revoke(params.deviceId);
      harness?.revoke(params.deviceId);
      return DONE_REPLY;
    }),
  };
}
