import { z } from 'zod';
import { sendUpload } from '../../../../api/connection/binary-upload';
import { assertHubLease, routeFor } from '../../../../api/connection/active-route';
import { connectionRefused, connectionState } from '../../../../api/connection/connection';
import type { ServerConnection } from '../../../../api/connection/storage';
import type { TransportAnswer, TransportRequest, UploadTransport } from './types';

class NotPairedUploadError extends Error {
  override readonly name = 'NotPairedUploadError';

  constructor(readonly status: string) {
    super(`Uploading needs a paired SmartEverything server, and the connection is ${status}.`);
  }
}

function headersOf(response: Response): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  return headers;
}

async function sendThroughRoute(
  connection: ServerConnection,
  route: ReturnType<typeof routeFor>,
  request: TransportRequest,
): Promise<TransportAnswer> {
  await route.ready();
  const lease = route.lease();
  assertHubLease(lease, request.method);
  try {
    const url = `${lease.baseUrl}${request.path}`;
    const headers = { ...request.headers, authorization: `Bearer ${connection.token}` };
    const response =
      request.body === null
        ? await lease.fetch(url, {
            method: request.method,
            redirect: 'error',
            signal: request.signal,
            headers,
          })
        : await sendUpload(lease, {
            url,
            headers,
            body: request.body,
            signal: request.signal,
            method: z.enum(['POST', 'PUT', 'PATCH']).parse(request.method),
            onProgress: () => undefined,
          });
    if (response.status === 401) connectionRefused(connection);
    return { status: response.status, headers: headersOf(response), body: await response.text() };
  } catch (error) {
    if (!request.signal.aborted) {
      assertHubLease(lease, request.method);
      lease.failed();
    }
    throw error;
  }
}

export function connectionUploadTransport(connection: ServerConnection): UploadTransport {
  const route = routeFor(connection);
  return { send: (request) => sendThroughRoute(connection, route, request) };
}

export function pairedUploadTransport(): UploadTransport {
  const state = connectionState.get();
  if (state.status !== 'paired') throw new NotPairedUploadError(state.status);
  return connectionUploadTransport(state.connection);
}
