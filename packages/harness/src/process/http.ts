import type { z } from 'zod';
import { ApiError, apiErrorOf } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessCallRequest, HarnessTransportRequest } from '@smarteverything/domain';
import type { HarnessBoot } from './boot';
import { connectionDiagnosticFetch } from './connection-diagnostics';

export interface HarnessCallPort {
  call(request: HarnessCallRequest, signal?: AbortSignal): Promise<unknown>;
}

function errorBody(response: Response): Promise<unknown> {
  const json = response.headers.get('content-type')?.includes('json') === true;
  return json ? response.json() : response.text();
}

const log = new Logger('hub.harness-hub');

export class HarnessHub {
  constructor(
    private readonly boot: HarnessBoot,
    private readonly port: HarnessCallPort,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async download(path: string, signal?: AbortSignal): Promise<Uint8Array> {
    const startedAt = performance.now();
    const response = await this.fetcher(new URL(path, this.boot.hub_url), {
      headers: { authorization: `Bearer ${this.boot.token}` },
      redirect: 'error',
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) {
      log.warn('download.refused', {
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw apiErrorOf(response.status, await errorBody(response));
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    log.debug('download.finished', () => ({
      bytes: bytes.length,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    return bytes;
  }

  async call<S extends z.ZodType>(
    request: HarnessCallRequest,
    schema: S,
    signal?: AbortSignal,
  ): Promise<z.output<S>> {
    let value: unknown;
    const startedAt = performance.now();
    try {
      value = await this.port.call(request, signal);
    } catch (cause) {
      log.warn('call.failed', {
        operation: request.operation,
        cause: cause instanceof Error ? cause.name : typeof cause,
        errorCode: cause instanceof ApiError ? cause.code : undefined,
        aborted: signal?.aborted === true,
        durationMs: Math.round(performance.now() - startedAt),
      });
      if (cause instanceof ApiError && cause.code === 'ownership_lost')
        throw new HarnessRuntimeError('ownership_lost', cause.message);
      throw cause;
    }
    log.trace('call.finished', () => ({
      operation: request.operation,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    return schema.parse(value);
  }

  identity(): Pick<HarnessTransportRequest, 'device_id' | 'generation' | 'runtime_instance'> {
    return {
      device_id: this.boot.device_id,
      generation: this.boot.generation,
      runtime_instance: this.boot.runtime_instance,
    };
  }
}

export async function harnessInference(
  options: {
    readonly boot: HarnessBoot;
    readonly claim: unknown;
    readonly routeId: string;
    readonly ordinary_request?: boolean;
    readonly fetcher?: typeof fetch;
  },
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  if (request.url !== 'https://openrouter.ai/api/v1/chat/completions' || request.method !== 'POST')
    throw new HarnessRuntimeError(
      'route_unavailable',
      'The supplier transport accepts only the selected model inference endpoint.',
    );
  const body: unknown = JSON.parse(await request.text());
  return connectionDiagnosticFetch('harness_hub', options.fetcher ?? fetch)(
    new URL('/api/ai/harness/inference', options.boot.hub_url),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.boot.token}`,
        'content-type': 'application/json',
        ...(options.ordinary_request === true
          ? { 'x-smarteverything-ordinary-request': 'true' }
          : {}),
      },
      redirect: 'error',
      signal: request.signal,
      body: JSON.stringify({
        device_id: options.boot.device_id,
        generation: options.boot.generation,
        runtime_instance: options.boot.runtime_instance,
        claim: options.claim,
        route_id: options.routeId,
        request: body,
      }),
    },
  );
}
