import { NATIVE_HUB_REQUEST, type NativeHubResponse } from '@smarteverything/domain';
import type { HubLeasePort } from './lease';
import { headerEntries, hubCall } from './transport';

export async function requestHub(
  policies: HubLeasePort,
  value: unknown,
): Promise<NativeHubResponse> {
  const input = NATIVE_HUB_REQUEST.parse(value);
  const lease = policies.lease(input.scopeId, input.url, input.binding, input.routeGeneration);
  try {
    const response = await hubCall(lease, {
      method: input.method,
      headers: input.headers,
      ...(input.body === null ? {} : { body: input.body }),
    });
    const body = await response.body.text();
    return {
      status: response.statusCode,
      headers: Object.fromEntries(headerEntries(response.headers)),
      body,
    };
  } catch (cause) {
    if (lease.signal?.aborted !== true) policies.failed?.(input.scopeId, input.routeGeneration);
    throw cause;
  }
}
