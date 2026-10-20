import { buildPath, type EndpointShape } from '@smarteverything/domain';
import { z } from 'zod';

export interface Input<E extends EndpointShape> {
  readonly params?: z.input<E['params']>;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: z.input<E['body']>;
}

interface Refusal {
  readonly status: number;
  readonly message: string;
}

export interface Client {
  readonly request: <E extends EndpointShape>(
    endpoint: E,
    input?: Input<E>,
  ) => Promise<z.output<E['response']>>;
  readonly refused: <E extends EndpointShape>(endpoint: E, input?: Input<E>) => Promise<Refusal>;
}

const PARAMS = z.record(z.string(), z.string());
const MESSAGE = z.object({ error: z.object({ message: z.string() }) });

function pathOf(
  endpoint: EndpointShape,
  input: { readonly params?: unknown; readonly query?: Readonly<Record<string, string>> },
): string {
  const path = buildPath(endpoint.path, PARAMS.parse(input.params ?? {}));
  const query = new URLSearchParams(input.query ?? {}).toString();
  return query === '' ? path : `${path}?${query}`;
}

function parsed<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  return schema.parse(value);
}

interface Reply {
  readonly status: number;
  readonly body: unknown;
}

type Send = (
  endpoint: EndpointShape,
  input: { readonly params?: unknown; readonly query?: Record<string, string>; body?: unknown },
) => Promise<Reply>;

async function requestOk<E extends EndpointShape>(
  send: Send,
  endpoint: E,
  input: Input<E>,
): Promise<z.output<E['response']>> {
  const reply = await send(endpoint, input);
  if (reply.status !== 200) {
    throw new Error(
      `${endpoint.method} ${endpoint.path} answered ${String(reply.status)}: ${JSON.stringify(reply.body)}`,
    );
  }
  return parsed<E['response']>(endpoint.response, reply.body);
}

export function clientOf(base: string, token: string): Client {
  const send: Send = async (endpoint, input) => {
    const response = await fetch(`${base}${pathOf(endpoint, input)}`, {
      method: endpoint.method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text === '' ? null : JSON.parse(text) };
  };
  return {
    request: (endpoint, input = {}) => requestOk(send, endpoint, input),
    refused: async (endpoint, input = {}): Promise<Refusal> => {
      const reply = await send(endpoint, input);
      const message = MESSAGE.safeParse(reply.body);
      return { status: reply.status, message: message.success ? message.data.error.message : '' };
    },
  };
}
