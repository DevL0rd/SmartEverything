import { MCP_PATHS, MCP_SCOPE } from '@smarteverything/domain';
import type { Site } from '../site';
import { OAUTH_AUTH_METHODS } from '../../../store/repositories/oauth';

export function resourceMetadata(site: Site): Record<string, unknown> {
  return {
    resource: site.resource,
    authorization_servers: [site.issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: [MCP_SCOPE],
    resource_name: 'SmartEverything',
  };
}

export function serverMetadata(site: Site): Record<string, unknown> {
  return {
    issuer: site.issuer,
    authorization_endpoint: `${site.issuer}${MCP_PATHS.authorize}`,
    token_endpoint: `${site.issuer}${MCP_PATHS.token}`,
    registration_endpoint: `${site.issuer}${MCP_PATHS.register}`,
    revocation_endpoint: `${site.issuer}${MCP_PATHS.revoke}`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: OAUTH_AUTH_METHODS,
    revocation_endpoint_auth_methods_supported: OAUTH_AUTH_METHODS,
    scopes_supported: [MCP_SCOPE],
    authorization_response_iss_parameter_supported: true,
  };
}
