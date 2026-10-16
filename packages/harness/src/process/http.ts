import type { z } from 'zod';
import { apiErrorOf } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
import { HARNESS_TRANSPORT_REQUEST } from '@smarteverything/domain/node/harness-frames';
import type { HarnessTransportRequest } from '@smarteverything/domain/node/harness-frames';
import type { HarnessBoot } from './boot';
import { connectionDiagnosticFetch } from './connection-diagnostics';

export class HarnessHttp {
  constructor(
    private readonly boot: HarnessBoot,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async call<S extends z.ZodType>(
    request: HarnessTransportRequest['request'],
    schema: S,
    signal?: AbortSignal,
  ): Promise<z.output<S>> {
    const response = await this.fetcher(new URL('/api/ai/harness/transport', this.boot.hub_url), {
      method: 'POST',
      headers: { authorization: `Bearer ${this.boot.token}`, 'content-type': 'application/json' },
      redirect: 'error',
      signal: signal ?? AbortSignal.timeout(30_000),
      body: JSON.stringify(HARNESS_TRANSPORT_REQUEST.parse({ ...this.identity(), request })),
    });
    if (!response.ok) {
      const refusal = apiErrorOf(response.status, await response.json());
      if (refusal.code === 'ownership_lost')
        throw new HarnessRuntimeError('ownership_lost', refusal.message);
      throw refusal;
    }
    return schema.parse(await response.json());
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
