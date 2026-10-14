import { previewPublicationView } from '../preview/compatibility';
import { nativeMediaNote } from './native-media-notes';
import { subscriptionConsumerRoute } from './subscription-consumer';
import { authenticate, requireActor } from './transport-actor';
import type { TransportActor } from './transport-actor';
import { requestSignalHandler } from '../server/request-signal';
import { HarnessAttachments } from './attachments';
import { centralCatalogue, centralTransport } from './central-transport';
import { meteredAccountingFetch } from './metered-accounting';
import { connectionDiagnosticFetch } from '@smarteverything/harness/process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { z } from 'zod';
import {
  ApiError,
  ASSISTANT_ATTACHMENT_BYTES_MAX,
  AI_PREVIEW_NATIVE_REQUEST,
  HARNESS_TRANSPORT_REQUEST,
  DSH_WRITER_CLAIM_WRITE,
  JSON_VALUE,
} from '@smarteverything/domain';
import type {
  HarnessTransportRequest,
  AiHtmlPreviewPublication,
  AiPreviewPublication,
} from '@smarteverything/domain';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RawRoute } from '../server/http-server';
import { readBody, parseJsonBody, sendJson, BODY_LIMIT } from '../server/http';
import type { ServerContext } from '../server/context';
import type { HarnessService } from './service';

const MEDIA_OPERATIONS = new Set(['attachment', 'native_media_note']);
const TRANSPORT_BODY_LIMIT = Math.ceil(ASSISTANT_ATTACHMENT_BYTES_MAX / 3) * 4 + 64 * 1024;

const INFERENCE = z.strictObject({
  device_id: z.uuid(),
  generation: z.uuid(),
  runtime_instance: z.uuid(),
  claim: DSH_WRITER_CLAIM_WRITE,
  route_id: z.uuid(),
  request: z.strictObject({
    model: z.string().min(1).max(200),
    stream: z.literal(true),
    messages: z.array(JSON_VALUE).max(10_000),
    stream_options: z.strictObject({ include_usage: z.literal(true) }).optional(),
    store: z.literal(false).optional(),
    max_tokens: z.int().positive().max(1_000_000).optional(),
    max_completion_tokens: z.int().positive().max(1_000_000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    tools: z.array(JSON_VALUE).max(2000).optional(),
    tool_choice: JSON_VALUE.optional(),
    reasoning: z.strictObject({ effort: z.string().min(1).max(32) }).optional(),
    reasoning_effort: z.string().min(1).max(32).optional(),
    prompt_cache_key: z.string().max(200).optional(),
    prompt_cache_retention: z.literal('24h').optional(),
  }),
});
export function harnessTransportRoutes(
  context: ServerContext,
  service: HarnessService,
  fetcher: typeof fetch,
): readonly RawRoute[] {
  return [
    subscriptionConsumerRoute(context, service),
    {
      method: 'POST',
      path: '/api/ai/harness/transport',
      handle: requestSignalHandler(async (request, response): Promise<void> => {
        const body = HARNESS_TRANSPORT_REQUEST.parse(
          parseJsonBody(request, await readBody(request, TRANSPORT_BODY_LIMIT)),
        );
        const actor = authenticate(context, request, body.device_id);
        sendJson(response, 200, await transport(context, service, actor, body));
      }),
    },
    {
      method: 'POST',
      path: '/api/ai/harness/inference',
      handle: async (request, response): Promise<void> => {
        await inference({ context, service, fetcher }, request, response);
      },
    },
  ];
}
async function transport(
  context: ServerContext,
  service: HarnessService,
  actor: TransportActor,
  input: HarnessTransportRequest,
): Promise<unknown> {
  const request = input.request;
  const discovery = discover(service, actor, input);
  if (discovery !== undefined) return discovery;
  const connection = service.directory.bound(
    input.device_id,
    input.generation,
    input.runtime_instance,
  );
  requireActor(connection, actor);
  if (request.operation.startsWith('preview_')) return previewTransport(context, input);
  if (request.operation === 'configuration_report')
    return service.configuration.report(request.report, request.manifest, connection);
  if (['context', 'tool', 'project_file'].includes(request.operation))
    return centralTransport(service, input);
  if (MEDIA_OPERATIONS.has(request.operation)) return mediaTransport(context, service, input);
  if (request.operation === 'unregister')
    throw new ApiError('forbidden', 'Computer execution channel owns its lifecycle.');
  if (request.operation === 'publish') return publish(service, input);
  return service.storage.execute(input);
}
function discover(
  service: HarnessService,
  actor: TransportActor,
  input: HarnessTransportRequest,
): unknown {
  const request = input.request;
  if (request.operation === 'configuration') return service.configuration.desired();
  if (request.operation === 'tools') return centralCatalogue(service);
  if (request.operation === 'catalogue') {
    if (actor.profileId === null)
      throw new ApiError(
        'forbidden',
        'Computer catalogue discovery requires an initiating conversation profile; explicit routes arrive through its execution channel.',
      );
    return service.routes.list(actor.profileId);
  }
  if (request.operation === 'register')
    throw new ApiError(
      'forbidden',
      'Computer composition registers through its execution channel.',
    );
  return undefined;
}
async function mediaTransport(
  context: ServerContext,
  service: HarnessService,
  input: HarnessTransportRequest,
): Promise<unknown> {
  const request = input.request;
  if (request.operation === 'attachment') return attachment(context, service, input);
  if (request.operation !== 'native_media_note')
    throw new ApiError('invalid_request', 'Expected an admitted native media operation.');
  service.storage.verify(request.claim, input);
  const text = await nativeMediaNote(
    service,
    context.assistant.files,
    request.claim,
    request.input,
  );
  service.storage.verify(request.claim, input);
  return { text };
}

async function attachment(
  context: ServerContext,
  service: HarnessService,
  input: HarnessTransportRequest,
): Promise<unknown> {
  const request = input.request;
  if (request.operation !== 'attachment')
    throw new ApiError('invalid_request', 'Expected a scoped attachment transfer.');
  service.storage.verify(request.claim, input);
  for await (const file of new HarnessAttachments(service, context.assistant.files).load(
    request.claim.session_id,
    [request.attachment_id],
  ))
    return {
      name: file.name,
      mime: file.mime,
      bytes: file.data.byteLength,
      sha256: createHash('sha256').update(file.data).digest('hex'),
      data: Buffer.from(file.data).toString('base64'),
      transcript: file.transcript,
    };
  throw new ApiError('not_found', 'The admitted attachment source is absent.');
}
function publish(service: HarnessService, input: HarnessTransportRequest): unknown {
  const request = input.request;
  if (request.operation !== 'publish')
    throw new ApiError('invalid_request', 'Expected a native projection publication.');
  const frame = request.frame;
  requireFrameBinding(frame, input);
  if (frame.type === 'harness_subscription_status') {
    service.subscriptions.frame(frame);
    return { ok: true };
  }
  if (frame.type === 'harness_configuration_report') {
    return service.configuration.report(
      frame.report,
      frame.manifest,
      service.directory.bound(input.device_id, input.generation, input.runtime_instance),
    );
  }
  if (frame.type !== 'harness_event')
    throw new ApiError(
      'forbidden',
      'HTTP native publication accepts only canonical session events.',
    );
  service.storage.principal(frame.event.session_id, input);
  const state = service.store.harnessCoordination.state(frame.event.session_id);
  if (state?.epoch !== frame.event.epoch)
    throw new ApiError(
      'forbidden',
      'The native projection does not belong to this profile or writer epoch.',
    );
  service.publish(frame.event);
  service.directory.frame(frame);
  return { ok: true };
}
function requireFrameBinding(
  frame: {
    readonly device_id: string;
    readonly generation: string;
    readonly runtime_instance: string;
  },
  input: HarnessTransportRequest,
): void {
  if (
    frame.device_id !== input.device_id ||
    frame.generation !== input.generation ||
    frame.runtime_instance !== input.runtime_instance
  )
    throw new ApiError('forbidden', 'A runtime cannot publish another host generation.');
}
interface InferencePorts {
  readonly context: ServerContext;
  readonly service: HarnessService;
  readonly fetcher: typeof fetch;
}
async function inference(
  ports: InferencePorts,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const { context, service, fetcher } = ports;
  const body = INFERENCE.parse(parseJsonBody(request, await readBody(request, BODY_LIMIT)));
  authenticate(context, request, body.device_id);
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
    body.request.model !== grant.route.model ||
    /^(?:anthropic|openai)\//.test(body.request.model)
  )
    throw new ApiError(
      'forbidden',
      'Inference must use this conversation’s exact authorized supplier and model; subscription routes have no paid fallback.',
    );
  await streamInference(
    { context, service, fetcher },
    { request: body.request, claim: body.claim, identity: body },
    response,
  );
}
async function streamInference(
  ports: InferencePorts,
  body: {
    readonly request: z.infer<typeof INFERENCE>['request'];
    readonly claim: z.infer<typeof INFERENCE>['claim'];
    readonly identity: z.infer<typeof INFERENCE>;
  },
  response: ServerResponse,
): Promise<void> {
  const { context, service, fetcher } = ports;
  const key = context.secrets.read().openrouterKey;
  if (key === null)
    throw new ApiError('conflict', 'The selected OpenRouter supplier is unavailable.');
  const abort = new AbortController();
  const disconnected = (): void => {
    abort.abort('Execution host disconnected.');
  };
  response.once('close', disconnected);
  try {
    const meteredFetch = meteredAccountingFetch(
      service,
      body.claim.session_id,
      connectionDiagnosticFetch('hub_supplier', fetcher),
      (): void => {
        service.storage.verify(body.claim, body.identity);
      },
    );
    const upstream = await meteredFetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body.request),
      redirect: 'error',
      signal: abort.signal,
    });
    response.writeHead(upstream.status, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
    });
    if (upstream.body === null)
      throw new ApiError('upstream_failed', 'The supplying model returned no stream.');
    for await (const chunk of upstream.body) {
      service.storage.verify(body.claim, body.identity);
      if (!response.write(chunk)) await once(response, 'drain', { signal: abort.signal });
    }
    response.end();
  } finally {
    abort.abort('Inference forwarding finished.');
    response.removeListener('close', disconnected);
  }
}

function previewTransport(context: ServerContext, input: HarnessTransportRequest): unknown {
  const preview = AI_PREVIEW_NATIVE_REQUEST.parse(input.request);
  if (
    preview.operation === 'preview_file_abandon' ||
    preview.operation === 'preview_file_publish' ||
    preview.operation === 'preview_file_validate' ||
    preview.operation === 'preview_file_update'
  )
    return previewReceipt(context.preview.files.native(input, preview));
  return previewReceipt(context.preview.publications.native(input, preview));
}

function previewReceipt(
  value: AiHtmlPreviewPublication | AiPreviewPublication | { readonly ok: true },
): unknown {
  return 'ok' in value ? value : previewPublicationView(value, undefined);
}
