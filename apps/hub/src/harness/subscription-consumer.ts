import { once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ApiError,
  SUBSCRIPTION_CONSUMER_REQUEST,
  SUBSCRIPTION_INFERENCE_RESULT,
  SUBSCRIPTION_INFERENCE_MAX_BYTES,
} from '@smarteverything/domain';
import type { SubscriptionConsumerRequest } from '@smarteverything/domain';
import type { RawRoute } from '../server/http-server';
import { readBody, parseJsonBody } from '../server/http';
import type { ServerContext } from '../server/context';
import type { HarnessService } from './service';
import { authenticate, requireActor } from './transport-actor';
import {
  admitSupplierInference,
  subscriptionInferenceConnection,
  admitConsumerExecution,
} from './supplier-inference';

const MAX_CALLS = 4;
const CALL_TIMEOUT_MS = 15 * 60_000;
export function subscriptionConsumerRoute(
  context: ServerContext,
  service: HarnessService,
): RawRoute {
  const counts = new Map<string, number>();
  return {
    method: 'POST',
    path: '/api/ai/harness/subscription-inference',
    handle: async (request, response): Promise<void> => {
      const body = SUBSCRIPTION_CONSUMER_REQUEST.parse(
        parseJsonBody(request, await readBody(request, SUBSCRIPTION_INFERENCE_MAX_BYTES)),
      );
      const admit = (): void => {
        admitConsumerCall(context, service, request, body);
      };
      admit();
      const key = `${body.device_id}:${body.generation}:${body.runtime_instance}`;
      const count = counts.get(key) ?? 0;
      if (count >= MAX_CALLS)
        throw new ApiError(
          'conflict',
          'This execution host has no available bounded model relay slot.',
        );
      counts.set(key, count + 1);
      try {
        await streamConsumerCall({ service, body, admit }, request, response);
      } finally {
        releaseCall(counts, key);
      }
    },
  };
}
function admitConsumerCall(
  context: ServerContext,
  service: HarnessService,
  request: IncomingMessage,
  body: SubscriptionConsumerRequest,
): void {
  const actor = authenticate(context, request, body.device_id);
  const execution = service.directory.bound(body.device_id, body.generation, body.runtime_instance);
  requireActor(execution, actor);
  admitConsumerExecution(service, execution);
  if (body.request.kind === 'stream') admitConsumerWriter(service, body);
  const supplier = subscriptionInferenceConnection(service, body.request.route);
  if (supplier.host.target.kind !== 'device')
    throw new ApiError(
      'forbidden',
      'Remote model inference requires its negotiated device supplier.',
    );
  admitSupplierInference(
    service,
    {
      device_id: supplier.host.target.device_id,
      generation: supplier.host.connection_generation,
      runtime_instance: supplier.host.runtime_instance,
    },
    body.request,
  );
}
function admitConsumerWriter(service: HarnessService, body: SubscriptionConsumerRequest): void {
  const request = body.request;
  if (request.kind !== 'stream')
    throw new ApiError('invalid_request', 'Expected execution inference.');
  if (
    request.execution?.device_id !== body.device_id ||
    request.execution.generation !== body.generation ||
    request.execution.runtime_instance !== body.runtime_instance
  )
    throw new ApiError('forbidden', 'The model request names another execution binding.');
  service.storage.verify(request.claim, body);
}
interface ConsumerCall {
  readonly service: HarnessService;
  readonly body: SubscriptionConsumerRequest;
  readonly admit: () => void;
}
async function streamConsumerCall(
  input: ConsumerCall,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const { service, admit } = input;
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(CALL_TIMEOUT_MS)]);
  const disconnected = (): void => {
    controller.abort('Execution model relay disconnected; completion is uncertain.');
  };
  const revalidate = (): void => {
    if (signal.aborted) return;
    try {
      admit();
    } catch (cause) {
      controller.abort(cause);
    }
  };
  request.once('aborted', disconnected);
  response.once('close', disconnected);
  const disposers = [
    service.store.feed.subscribeCommitted(revalidate),
    service.routes.onChange(revalidate),
    service.directory.onRegister(revalidate),
    service.directory.onOffline(revalidate),
  ];
  try {
    if ((request.destroyed && !request.complete) || response.destroyed) disconnected();
    signal.throwIfAborted();
    await forwardResults(input, response, signal);
    response.end();
  } finally {
    controller.abort('Execution model relay released.');
    for (const dispose of disposers) dispose();
    request.removeListener('aborted', disconnected);
    response.removeListener('close', disconnected);
  }
}

async function forwardResults(
  input: ConsumerCall,
  response: ServerResponse,
  signal: AbortSignal,
): Promise<void> {
  const { service, body, admit } = input;
  const supplier = subscriptionInferenceConnection(service, body.request.route).inference;
  if (supplier === undefined)
    throw new ApiError('conflict', 'The subscription supplier inference port is unavailable.');
  for await (const raw of supplier.call(body.request, signal)) {
    signal.throwIfAborted();
    admit();
    const result = SUBSCRIPTION_INFERENCE_RESULT.parse(raw);
    const frame = `${JSON.stringify(result)}\n`;
    if (Buffer.byteLength(frame) > SUBSCRIPTION_INFERENCE_MAX_BYTES)
      throw new ApiError(
        'upstream_failed',
        'The subscription supplier exceeded its bounded frame size.',
      );
    if (!response.headersSent)
      response.writeHead(200, {
        'content-type': 'application/x-ndjson',
        'cache-control': 'no-store',
      });
    if (!response.write(frame)) await once(response, 'drain', { signal });
  }
  admit();
}

function releaseCall(counts: Map<string, number>, key: string): void {
  const current = counts.get(key);
  if (current === undefined)
    throw new ApiError('internal', 'The model relay lost its owned call slot.');
  if (current === 1) counts.delete(key);
  else counts.set(key, current - 1);
}
