import { ApiError, MCP_PATHS } from '@smarteverything/domain';
import type { Store } from '../../store/store';

export interface Site {
  readonly issuer: string;
  readonly resource: string;
  readonly resourceMetadata: string;
}

export function siteOf(store: Store): Site {
  const settings = store.settings.read();
  if (settings.public_url === null || settings.public_url_verified_at === null) {
    throw new ApiError(
      'public_url_not_verified',
      'Set and verify the public URL in Remote access before connecting an assistant; it reaches this computer through it.',
    );
  }
  const issuer = settings.public_url.replace(/\/+$/, '');
  return {
    issuer,
    resource: `${issuer}${MCP_PATHS.mcp}`,
    resourceMetadata: `${issuer}${MCP_PATHS.mcpResourceMetadata}`,
  };
}
