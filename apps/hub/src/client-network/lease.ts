import type { Agent } from 'node:http';
import type { Dispatcher } from 'undici';
import type { NativeHubCredentialBinding } from '@smarteverything/domain';

export interface HubLease {
  readonly url: URL;
  readonly dispatcher?: Dispatcher;
  readonly agent?: Agent | undefined;
  readonly signal?: AbortSignal;
}
export interface HubLeasePort {
  failed?(scopeId: string, routeGeneration: number | undefined): void;
  lease(
    scopeId: string,
    input: string,
    binding?: NativeHubCredentialBinding,
    routeGeneration?: number,
  ): HubLease;
}
