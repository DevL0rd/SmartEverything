import type { EndpointShape } from '@smarteverything/domain';
import type { z } from 'zod';
import { invalidDetail } from './invalid';
import { notJsonBody } from './http';
import type { DecodedBody, ResponseEncoder } from './responses/encoder';

export function decodedBodyValue<T>(decoded: DecodedBody<T>): T {
  if (decoded.kind === 'body') return decoded.value;
  throw decoded.kind === 'not_json' ? notJsonBody() : invalidDetail('body', decoded.detail);
}

export async function requestBodyOf<B extends z.ZodType>(
  encoder: ResponseEncoder,
  endpoint: EndpointShape & { readonly body: B },
  bytes: Uint8Array,
): Promise<z.output<B>> {
  return decodedBodyValue(await encoder.decodeBody(endpoint, bytes));
}
