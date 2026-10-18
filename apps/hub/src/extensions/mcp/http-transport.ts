import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface StatelessHttp {
  readonly transport: Transport;
  readonly handle: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
}

export function statelessHttp(enableJsonResponse: boolean): StatelessHttp {
  const inner = new StreamableHTTPServerTransport({ enableJsonResponse });
  const transport: Transport = {
    start: () => inner.start(),
    close: () => inner.close(),
    send: (message, options) => inner.send(message, options),
  };
  inner.onclose = (): void => {
    transport.onclose?.();
  };
  inner.onerror = (error): void => {
    transport.onerror?.(error);
  };
  inner.onmessage = (message, extra): void => {
    transport.onmessage?.(message, extra);
  };
  return { transport, handle: (request, response) => inner.handleRequest(request, response) };
}
