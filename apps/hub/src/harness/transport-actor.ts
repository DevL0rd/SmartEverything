import { ApiError, NODE_AI_TOKEN } from '@smarteverything/domain';
import type { IncomingMessage } from 'node:http';
import { bearerOf } from '../server/http';
import type { ServerContext } from '../server/context';
import type { HarnessConnection } from './directory';
export interface TransportActor {
  readonly kind: 'node';
  readonly id: string;
  readonly deviceId: string;
  readonly profileId: string | null;
}
export function authenticate(
  context: ServerContext,
  request: IncomingMessage,
  deviceId: string,
): TransportActor {
  const token = bearerOf(request);
  if (!NODE_AI_TOKEN.safeParse(token).success)
    throw new ApiError('unauthorized', 'Harness transport requires its paired computer token.');
  const node = context.computerNodes.authenticate(token);
  if (node.device_id !== deviceId)
    throw new ApiError('forbidden', 'This node token belongs to another computer.');
  return { kind: 'node', id: deviceId, deviceId, profileId: null };
}
export function requireActor(connection: HarnessConnection, actor: TransportActor): void {
  if (connection.actor.kind !== actor.kind || connection.actor.id !== actor.id)
    throw new ApiError('forbidden', 'This actor did not register the current harness generation.');
}
