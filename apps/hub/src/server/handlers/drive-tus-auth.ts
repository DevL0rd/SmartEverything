import { ApiError, NODE_AI_TOKEN } from '@smarteverything/domain';
import type { IncomingMessage } from 'node:http';
import { nodeCaller } from '../../drive/node-caller';
import type { TusCaller } from '../../drive/uploads-tus-wire';
import type { ComputerNodeAccess } from '../../computers/node-access';
import type { Store } from '../../store/store';
import { authenticate, clientOf, type Caller } from '../auth';
import { bearerOf } from '../http';
import { actorOf } from './drive-services';

function callerOf(
  store: Store,
  nodes: Pick<ComputerNodeAccess, 'authenticate'>,
  request: IncomingMessage,
  token: string,
): { readonly caller: Caller; readonly node: boolean } {
  if (NODE_AI_TOKEN.safeParse(token).success) {
    return { caller: nodeCaller(store, nodes.authenticate(token)), node: true };
  }
  return { caller: authenticate(store, request, 'member', false), node: false };
}

export function tusAuthentication(
  store: Store,
  nodes: Pick<ComputerNodeAccess, 'authenticate'>,
): (request: IncomingMessage) => TusCaller | null {
  return (request) => {
    const token = bearerOf(request);
    if (token === null) return null;
    try {
      const { caller, node } = callerOf(store, nodes, request, token);
      const id = clientOf(caller).id;
      return {
        ...actorOf(store, caller),
        clientId: node ? null : id,
        nodeId: node ? id : null,
      };
    } catch (cause) {
      if (cause instanceof ApiError) return null;
      throw cause;
    }
  };
}
