import type { NativePageOpen } from '@smarteverything/domain';
import type { HubLeasePort } from '@smarteverything/hub/client-network/lease';

export interface NativeHtmlTransportPort extends HubLeasePort {
  authorize(scopeId: string, authorization: string, ownerId: number): void;
}
export interface NativeHtmlPage {
  readonly input: NativePageOpen;
  readonly owner: number;
  readonly signal: AbortSignal;
}
