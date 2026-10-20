import type { IncomingMessage, ServerResponse } from 'node:http';
import { messageOf } from '@smarteverything/logging';
import { ApiError, JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { WebhookCall, WebhookGateway } from '../../automations/webhooks/gateway';
import type { WebhookReply } from '../../automations/effects/webhook-replies';
import { readBody } from '../http';
import type { RawRoute } from '../http-server';

const WEBHOOK_PATH = '/hooks/:path';

const WEBHOOK_BODY_LIMIT = 1024 * 1024;

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;

type Gateway = Pick<WebhookGateway, 'call'>;

function textHeaders(request: IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    Object.entries(request.headers).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]],
    ),
  );
}

function queryOf(request: IncomingMessage): Record<string, string> {
  const url = new URL(request.url ?? '/', 'http://hub.invalid');
  return Object.fromEntries(url.searchParams.entries());
}

function bodyOf(request: IncomingMessage, raw: Buffer): JsonValue | undefined {
  if (raw.byteLength === 0) return undefined;
  const text = raw.toString('utf8');
  const type = (request.headers['content-type'] ?? '').toLowerCase();
  if (type.startsWith('application/json')) {
    try {
      return JSON_VALUE.parse(JSON.parse(text));
    } catch (cause) {
      throw new ApiError(
        'invalid_request',
        `The body says it is JSON but is not valid JSON: ${messageOf(cause)}.`,
      );
    }
  }
  if (type.startsWith('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  return text;
}

function send(response: ServerResponse, reply: WebhookReply): void {
  if (reply.body === undefined) {
    response.writeHead(reply.status, { ...reply.headers, 'cache-control': 'no-store' });
    response.end();
    return;
  }
  const text = JSON.stringify(reply.body);
  response.writeHead(reply.status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...reply.headers,
    'content-length': Buffer.byteLength(text),
  });
  response.end(text);
}

async function handle(
  gateway: Gateway,
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
): Promise<void> {
  const call: WebhookCall = {
    path,
    method: request.method ?? 'GET',
    body: bodyOf(request, await readBody(request, WEBHOOK_BODY_LIMIT)),
    headers: textHeaders(request),
    query: queryOf(request),
  };
  const reply = await gateway.call(call);
  if (reply === null) throw new ApiError('not_found', 'No automation answers this webhook.');
  send(response, reply);
}

export function webhookRoutes(gateway: Gateway): readonly RawRoute[] {
  return METHODS.map((method) => ({
    method,
    path: WEBHOOK_PATH,
    handle: (request, response, params): Promise<void> =>
      handle(gateway, request, response, params['path'] ?? ''),
  }));
}
