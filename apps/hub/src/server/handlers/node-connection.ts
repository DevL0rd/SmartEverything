import { ApiError, NODE_CONNECTION_RESPONSE, NODE_CONNECTION_PATH } from '@smarteverything/domain';
import { bearerOf, sendJson } from '../http';
import type { ServerContext } from '../context';
import type { RawRoute } from '../http-server';

export function nodeConnectionRoute(context: ServerContext): RawRoute {
  return {
    method: 'GET',
    path: NODE_CONNECTION_PATH,
    handle: (request, response): Promise<void> => {
      const node = context.computerNodes.authenticate(bearerOf(request));
      if (context.connections === undefined)
        throw new ApiError('upstream_failed', 'This hub has no paired connection identity.');
      sendJson(
        response,
        200,
        NODE_CONNECTION_RESPONSE.parse({
          device_id: node.device_id,
          connection: context.connections.metadata(),
        }),
      );
      return Promise.resolve();
    },
  };
}
