import { MCP_SCOPE, type McpToolArea } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { Site } from './site';

export type McpCaller =
  | {
      readonly kind: 'accepted';
      readonly via: 'personal' | 'oauth' | 'plugin' | 'computer';
      readonly id: string;
      readonly localOnly: boolean;
      readonly readOnly: boolean;
      readonly areas?: readonly McpToolArea[];
    }
  | { readonly kind: 'refused'; readonly reason: string };

export type AcceptedCaller = Extract<McpCaller, { readonly kind: 'accepted' }>;

export interface BearerCheck {
  readonly store: Pick<Store, 'host'>;
  readonly site: Site;
  readonly now: Date;
}

export async function callerFor(check: BearerCheck, token: string): Promise<McpCaller> {
  const found = await check.store.host.read('mcpBearer', {
    token,
    resource: check.site.resource,
    now: check.now.toISOString(),
  });
  if (found.personalTokenId !== null)
    await check.store.host.call('oauth', 'personalTokenUsed', found.personalTokenId);
  return found.caller;
}

export function challenge(site: Site, error: 'invalid_token' | null): string {
  const parameters = [
    ...(error === null ? [] : [`error="${error}"`]),
    `resource_metadata="${site.resourceMetadata}"`,
    `scope="${MCP_SCOPE}"`,
  ];
  return `Bearer ${parameters.join(', ')}`;
}
