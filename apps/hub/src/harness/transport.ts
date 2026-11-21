import { subscriptionConsumerRoute } from './subscription-consumer';
import { SecretApiKeyVault } from './api-key-vault';
import { authenticate } from './transport-actor';
import { HarnessAttachments } from './attachments';
import { centralCatalogue, centralTransport } from './central-transport';
import { meteredAccountingFetch } from './metered-accounting';
import { connectionDiagnosticFetch } from '@smarteverything/harness/process';
import { harnessTargetKey } from '@smarteverything/domain';
import { once } from 'node:events';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { ApiError } from '@smarteverything/domain';
import type { HarnessTransportRequest } from '@smarteverything/domain';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RawRoute } from '../server/http-server';
import { readBody, assertJsonBody, BODY_LIMIT } from '../server/http';
import { decodedBodyValue } from '../server/request-body';
import type { ResponseEncoder } from '../server/responses/encoder';
import type { ServerContext } from '../server/context';
import type { HarnessService } from './service';
import { nativeMediaNote } from './native-media-notes';
import { acceptPublication } from './native-publication';
import { InferenceTrace } from './inference-trace';
import type { InferenceRequest } from './inference-request';

const log = new Logger('hub.harness');

export function harnessTransportRoutes(
  context: ServerContext,
  service: HarnessService,
  fetcher: typeof fetch,
  encoder: ResponseEncoder,
): readonly RawRoute[] {
  return [
    subscriptionConsumerRoute(context, service),
    {
      method: 'GET',
      path: '/api/ai/harness/sessions/:sessionId/attachments/:attachmentId',
      handle: async (request, response, params): Promise<void> => {
        await attachmentBytes({ context, service }, request, response, params);
      },
    },
    {
      method: 'POST',
      path: '/api/ai/harness/inference',
      handle: async (request, response): Promise<void> => {
        await inference({ context, service, fetcher, encoder }, request, response);
      },
    },
  ];
}
export type HarnessTransportPorts = Pick<ServerContext, 'assistant' | 'secrets'>;
export async function harnessTransport(
  context: HarnessTransportPorts,
  service: HarnessService,
  input: HarnessTransportRequest,
): Promise<unknown> {
  const startedAt = performance.now();
  const fields = {
    operation: input.request.operation,
    deviceId: input.device_id,
    generation: input.generation,
    runtimeInstance: input.runtime_instance,
  };
  try {
    const result = await dispatchTransport(context, service, input);
    log.debug('harness.transport_served', () => ({
      ...fields,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    return result;
  } catch (cause) {
    log.error('harness.transport_failed', cause, {
      ...fields,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw cause;
  }
}
async function dispatchTransport(
  context: HarnessTransportPorts,
  service: HarnessService,
  input: HarnessTransportRequest,
): Promise<unknown> {
  const request = input.request;
  if (request.operation === 'tools') return centralCatalogue(service);
  if (request.operation === 'api_key')
    return {
      value: (await new SecretApiKeyVault(context.secrets).read(request.reference)) ?? null,
    };
  if (request.operation === 'extension_tree')
    return service.extensions.tree(request.kind, request.id, request.version);
  if (request.operation === 'configuration_report')
    return service.configuration.report(
      request.report,
      request.manifest,
      service.directory.bound(input.device_id, input.generation, input.runtime_instance),
    );
  if (['context', 'tool'].includes(request.operation)) return centralTransport(service, input);
  if (request.operation === 'attachment') return attachment(context, service, input);
  if (request.operation === 'native_media_note') return mediaNote(context, service, input);
  if (request.operation === 'publish') return acceptPublication(service, input);
  return service.storage.execute(input);
}
async function mediaNote(
  context: HarnessTransportPorts,
  service: HarnessService,
  input: HarnessTransportRequest,
): Promise<unknown> {
  const request = input.request;
  if (request.operation !== 'native_media_note')
    throw new ApiError('invalid_request', 'Expected a native media note.');
  service.storage.verify(request.claim, input);
  const text = await nativeMediaNote(
    service,
    context.assistant.files,
    request.claim,
    request.input,
  );
  return { text };
}

function attachment(
  context: HarnessTransportPorts,
  service: HarnessService,
  input: HarnessTransportRequest,
): unknown {
  const request = input.request;
  if (request.operation !== 'attachment')
    throw new ApiError('invalid_request', 'Expected an attachment description.');
  service.storage.verify(request.claim, input);
  const files = new HarnessAttachments(service, context.assistant.files);
  return files.describe(files.find(request.claim.session_id, request.attachment_id));
}
export interface AttachmentPorts {
  readonly context: Pick<ServerContext, 'computerNodes'> & {
    readonly assistant: Pick<ServerContext['assistant'], 'files'>;
  };
  readonly service: HarnessService;
}
export async function attachmentBytes(
  ports: AttachmentPorts,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  const { context, service } = ports;
  const node = await authenticate(context, request);
  const sessionId = z.uuid().parse(params['sessionId']);
  if (
    harnessTargetKey(service.storage.grant(sessionId).target) !==
    harnessTargetKey({ kind: 'device', device_id: node.deviceId })
  )
    throw new ApiError('forbidden', 'This computer is not the granted conversation host.');
  const files = new HarnessAttachments(service, context.assistant.files);
  const file = await files.read(files.find(sessionId, z.uuid().parse(params['attachmentId'])));
  response.writeHead(200, {
    'content-type': 'application/octet-stream',
    'content-length': file.data.byteLength,
    'cache-control': 'no-store',
  });
  response.end(file.data);
}
interface ForwardPorts {
  readonly context: ServerContext;
  readonly service: HarnessService;
  readonly fetcher: typeof fetch;
}
interface InferencePorts extends ForwardPorts {
  readonly encoder: ResponseEncoder;
}
async function inference(
  ports: InferencePorts,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const { context, service, fetcher, encoder } = ports;
  const raw = await readBody(request, BODY_LIMIT);
  assertJsonBody(request);
  const body = decodedBodyValue(await encoder.decodeInference(raw));
  await authenticate(context, request, body.device_id);
  const ordinaryRequest =
    z.literal('true').optional().parse(request.headers['x-smarteverything-ordinary-request']) ===
    'true';
  service.storage.verify(body.claim, body);
  const grant = service.storage.grant(body.claim.session_id);
  const route = service.routes.selected(
    grant.profile_id,
    grant.route,
    grant.authority.kind === 'trigger',
  );
  if (
    route.id !== body.route_id ||
    route.auth.provider !== 'openrouter' ||
    route.supplier.kind !== 'server' ||
    body.request.model !== grant.route.model
  )
    throw new ApiError(
      'forbidden',
      'Inference must use this conversation’s exact authorized supplier and model; subscription routes have no paid fallback.',
    );
  await streamInference(
    { context, service, fetcher },
    { request: body.request, claim: body.claim, identity: body, ordinaryRequest },
    response,
  );
}
function upstreamHeaders(upstream: Response): Record<string, string> {
  const retryAfter = upstream.headers.get('retry-after');
  return {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
    ...(retryAfter === null ? {} : { 'retry-after': retryAfter }),
  };
}
interface InferenceBody {
  readonly request: InferenceRequest['request'];
  readonly claim: InferenceRequest['claim'];
  readonly identity: InferenceRequest;
  readonly ordinaryRequest: boolean;
}

export const TOOL_CALL_BROKEN_PROVIDERS: readonly string[] = ['wafer'];

export function upstreamBody(request: InferenceBody['request'], sessionId: string): object {
  return {
    ...request,
    session_id: sessionId,
    usage: { include: true },
    provider: { ignore: TOOL_CALL_BROKEN_PROVIDERS },
  };
}

function forwardUpstream(
  ports: ForwardPorts,
  body: InferenceBody,
  key: string,
  signal: AbortSignal,
): Promise<Response> {
  const { service, fetcher } = ports;
  const meteredFetch = meteredAccountingFetch(
    service,
    body.claim.session_id,
    connectionDiagnosticFetch('hub_supplier', fetcher),
    inferenceAccounting(service, body),
  );
  return meteredFetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(upstreamBody(body.request, body.claim.session_id)),
    redirect: 'error',
    signal,
  });
}
async function streamInference(
  ports: ForwardPorts,
  body: InferenceBody,
  response: ServerResponse,
): Promise<void> {
  const { context } = ports;
  const key = context.secrets.read().openrouterKey;
  if (key === null)
    throw new ApiError('conflict', 'The selected OpenRouter supplier is unavailable.');
  const abort = new AbortController();
  const trace = new InferenceTrace({
    harnessSession: body.claim.session_id,
    deviceId: body.identity.device_id,
    routeId: body.identity.route_id,
    model: body.request.model,
    messages: body.request.messages.length,
    tools: body.request.tools?.length ?? 0,
  });
  const disconnected = (): void => {
    trace.disconnected();
    abort.abort('Execution host disconnected.');
  };
  response.once('close', disconnected);
  try {
    const upstream = await forwardUpstream(ports, body, key, abort.signal);
    trace.upstream(upstream.status, upstream.headers.get('retry-after'));
    response.writeHead(upstream.status, upstreamHeaders(upstream));
    if (upstream.body === null)
      throw new ApiError('upstream_failed', 'The supplying model returned no stream.');
    for await (const chunk of upstream.body) {
      trace.chunk(chunk instanceof Uint8Array ? chunk.byteLength : 0);
      if (!response.write(chunk)) await once(response, 'drain', { signal: abort.signal });
    }
    response.end();
    trace.finished(upstream.status);
  } catch (cause) {
    trace.failed(cause);
    throw cause;
  } finally {
    abort.abort('Inference forwarding finished.');
    response.removeListener('close', disconnected);
  }
}

function inferenceAccounting(
  service: HarnessService,
  body: {
    readonly claim: InferenceRequest['claim'];
    readonly identity: InferenceRequest;
    readonly ordinaryRequest: boolean;
  },
): Parameters<typeof meteredAccountingFetch>[3] {
  return {
    verify: (): void => {
      service.storage.verify(body.claim, body.identity);
    },
    ordinary_request: body.ordinaryRequest,
  };
}
