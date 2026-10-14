import { z } from 'zod';
import type {
  NativeHubNetwork,
  NativeHubTrust,
  NativeHubCredentialBinding,
} from '@smarteverything/domain';
import { nativeHubNetwork } from '../../../modules/health-connect/src/hub-network';
import { desktopBridge } from '../../design/platform';
import { Logger } from '@smarteverything/logging';

const log = new Logger('app.hub-route');

const METHOD = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export function hubNetwork(): NativeHubNetwork {
  const bridge = desktopBridge();
  return bridge?.hubNetwork ?? nativeHubNetwork;
}

export async function pinnedFetch(
  scopeId: string,
  url: string,
  init: RequestInit,
  route?: { readonly binding: NativeHubCredentialBinding; readonly routeGeneration: number },
): Promise<Response> {
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const response = await hubNetwork().request({
    scopeId,
    ...(route ?? {}),
    url,
    method: METHOD.parse(init.method),
    headers,
    body: typeof init.body === 'string' ? init.body : null,
  });
  return new Response(response.body === '' ? null : response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export function configureRouteTrust(trust: NativeHubTrust): Promise<void> {
  return hubNetwork().configureTrust(trust);
}

export async function clearRouteTrust(scopeId: string): Promise<void> {
  try {
    await hubNetwork().clearTrust(scopeId);
  } catch (error) {
    log.warn('route.trust_clear_failed', {
      failure: error instanceof Error ? error.name : 'NativeFailure',
    });
  }
}
