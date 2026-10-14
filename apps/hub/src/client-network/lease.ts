import type { Agent } from 'node:https';
import type { NativeHubCredentialBinding } from '@smarteverything/domain';
export interface HubLeasePort {
  failed?(scopeId: string, routeGeneration: number | undefined): void;
  lease(
    scopeId: string,
    input: string,
    binding?: NativeHubCredentialBinding,
    routeGeneration?: number,
  ): {
    readonly url: URL;
    readonly agent: Agent | undefined;
    readonly signal?: AbortSignal;
  };
}
