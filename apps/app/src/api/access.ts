import {
  API_ENDPOINTS as E,
  MCP_PATHS,
  type McpApprovalCode,
  type McpConsentDecision,
  isMcpToolName,
  type PublicUrlCheck,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { EntityStore } from '../store/entity-store';
import { api } from './transport';

const log = new Logger('app.access');

export function mcpServerUrlOf(publicUrl: string): string {
  return `${publicUrl.replace(/\/+$/, '')}${MCP_PATHS.mcp}`;
}

export async function createApprovalCode(): Promise<McpApprovalCode> {
  const code = await api().call(E.createApprovalCode, {});
  log.info('oauth.approval_code_created');
  return code;
}

export async function createMcpToken(name: string): Promise<string> {
  const created = await api().call(E.createMcpToken, { body: { name } });
  log.info('mcp_token.created');
  return created.token;
}

export async function revokeMcpToken(tokenId: string): Promise<void> {
  await api().call(E.revokeMcpToken, { params: { tokenId } });
  log.info('mcp_token.revoked', { tokenId });
}

export async function revokeOAuthGrant(clientId: string): Promise<void> {
  await api().call(E.revokeOAuthGrant, { params: { clientId } });
  log.info('oauth.grant_revoked', { clientId });
}

export async function updateMcpTools(
  store: EntityStore,
  disabled: readonly string[],
): Promise<void> {
  const known = disabled.filter(isMcpToolName);
  const settings = await api().call(E.updateMcpTools, { body: { disabled: known } });
  store.update((state) => ({ ...state, settings }));
  log.info('mcp_tools.updated', { disabled: disabled.length });
}

export async function decideMcpConsent(
  consentId: string,
  decision: McpConsentDecision,
): Promise<void> {
  await api().call(E.decideMcpConsent, { params: { consentId }, body: { decision } });
  log.info('mcp_consent.decided', { decision });
}

export async function setPublicUrl(store: EntityStore, url: string | null): Promise<void> {
  const settings = await api().call(E.setPublicUrl, { body: { url } });
  store.update((state) => ({ ...state, settings }));
  log.info('public_url.saved');
}

export async function verifyPublicUrl(store: EntityStore): Promise<PublicUrlCheck> {
  const check = await api().call(E.verifyPublicUrl, {});
  store.update((state) => ({ ...state, settings: check.settings }));
  log.info('public_url.verified', { outcome: check.outcome });
  return check;
}
