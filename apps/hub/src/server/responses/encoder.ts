import { API_ENDPOINTS, type EndpointShape } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { CodecJob } from '../../codec/protocol';
import { CodecThread, CodecWorkerError } from '../../codec/thread';
import type { InferenceRequest } from '../../harness/inference-request';

const NAMES: ReadonlyMap<EndpointShape, string> = new Map(
  Object.entries(API_ENDPOINTS).map(([name, endpoint]): [EndpointShape, string] => [
    endpoint,
    name,
  ]),
);

export type Encoded =
  | { readonly valid: true; readonly text: string }
  | { readonly valid: false; readonly issueCodes: readonly string[] };

export type DecodedBody<T> =
  | { readonly kind: 'body'; readonly value: T }
  | { readonly kind: 'not_json' }
  | { readonly kind: 'invalid'; readonly detail: string };

export function endpointNameOf(endpoint: EndpointShape): string {
  const name = NAMES.get(endpoint);
  if (name === undefined) {
    throw new CodecWorkerError(
      `${endpoint.method} ${endpoint.path} is not one of the shared API endpoints.`,
    );
  }
  return name;
}

export class ResponseEncoder {
  private readonly thread: CodecThread;

  constructor(script: string, log: Logger) {
    this.thread = new CodecThread(script, 'response', log.forArea('hub.responses'));
  }

  async encode(endpoint: EndpointShape, text: string, member: boolean): Promise<Encoded> {
    const reply = await this.thread.run({
      kind: 'response',
      endpoint: endpointNameOf(endpoint),
      text,
      member,
    });
    if (reply.kind === 'encoded') return { valid: true, text: reply.text };
    if (reply.kind === 'invalid') return { valid: false, issueCodes: reply.issueCodes };
    throw new CodecWorkerError(`The response worker answered ${reply.kind} to a response.`);
  }

  decodeBody<B extends z.ZodType>(
    endpoint: EndpointShape & { readonly body: B },
    bytes: Uint8Array,
  ): Promise<DecodedBody<z.output<B>>>;
  decodeBody(endpoint: EndpointShape, bytes: Uint8Array): Promise<DecodedBody<unknown>> {
    return this.decoded({ kind: 'body', endpoint: endpointNameOf(endpoint), bytes });
  }

  decodeInference(bytes: Uint8Array): Promise<DecodedBody<InferenceRequest>>;
  decodeInference(bytes: Uint8Array): Promise<DecodedBody<unknown>> {
    return this.decoded({ kind: 'inference', bytes });
  }

  private async decoded(job: CodecJob): Promise<DecodedBody<unknown>> {
    const reply = await this.thread.run(job);
    if (reply.kind === 'body') return { kind: 'body', value: reply.value };
    if (reply.kind === 'body_not_json') return { kind: 'not_json' };
    if (reply.kind === 'body_invalid') return { kind: 'invalid', detail: reply.detail };
    throw new CodecWorkerError(`The response worker answered ${reply.kind} to a request body.`);
  }

  close(): Promise<void> {
    return this.thread.close();
  }
}
