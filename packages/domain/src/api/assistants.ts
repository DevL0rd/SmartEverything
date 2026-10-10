import { z } from 'zod';
import { MCP_TOOL_NAME } from '../mcp/served';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, MOMENT, NOTHING } from './primitives';
import { SETTINGS_ROW } from './rows-home';

export const MCP_CONSENT_ACCESS = ['read', 'control'] as const;

export const MCP_CONSENT_REQUEST = z.strictObject({
  id: ID,
  clientName: z.string().min(1).max(200),
  clientUri: z.url().nullable(),
  access: z.array(z.enum(MCP_CONSENT_ACCESS)).min(1),
  requestedAt: MOMENT,
  expiresAt: MOMENT,
});

export type McpConsentRequest = z.infer<typeof MCP_CONSENT_REQUEST>;

export const MCP_CONSENT_DECISIONS = ['allow', 'deny'] as const;

export type McpConsentDecision = (typeof MCP_CONSENT_DECISIONS)[number];

export const MCP_CONSENT_OUTCOMES = ['allowed', 'denied', 'expired', 'cancelled'] as const;

export type McpConsentOutcome = (typeof MCP_CONSENT_OUTCOMES)[number];

export const MCP_CONSENT_OUTCOME = z.enum(MCP_CONSENT_OUTCOMES);

export const MCP_CONSENT_PUSH_DATA = z.strictObject({
  kind: z.literal('mcp_consent'),
  consentId: ID,
});

export type McpConsentPushData = z.infer<typeof MCP_CONSENT_PUSH_DATA>;

export interface McpConsentPush {
  readonly title: string;
  readonly body: string;
  readonly data: McpConsentPushData;
}

export function mcpConsentPush(request: McpConsentRequest, homeName: string): McpConsentPush {
  return {
    title: `${request.clientName} wants access`,
    body: `Allow or deny it for ${homeName} in SmartEverything.`,
    data: { kind: 'mcp_consent', consentId: request.id },
  };
}

export const MCP_ACCESS_ENDPOINTS = {
  updateMcpTools: endpoint({
    method: 'PUT',
    path: '/api/mcp/tools',
    access: 'owner',
    summary: 'Replace the list of MCP tools assistants may not use; every other tool is on',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ disabled: z.array(MCP_TOOL_NAME) }),
    response: SETTINGS_ROW,
  }),
  listMcpConsents: endpoint({
    method: 'GET',
    path: '/api/mcp/consents',
    access: 'owner',
    summary: 'Assistants waiting for the owner to allow or deny them, oldest first',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(MCP_CONSENT_REQUEST),
  }),
  decideMcpConsent: endpoint({
    method: 'POST',
    path: '/api/mcp/consents/:consentId',
    access: 'owner',
    summary: 'Allow or deny a waiting assistant; its authorize page redirects at once',
    params: z.strictObject({ consentId: ID }),
    query: NOTHING,
    body: z.strictObject({ decision: z.enum(MCP_CONSENT_DECISIONS) }),
    response: DONE,
  }),
} as const;
