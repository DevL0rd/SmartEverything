import { createHash, randomBytes } from 'node:crypto';
import { MCP_APPROVAL_CODE } from '@smarteverything/domain';
import { expect } from 'vitest';
import { z } from 'zod';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { temporaryDirectory } from '../support/server';

export const PUBLIC_URL = 'https://home.example.com';

export const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

const RESULT = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.number(), z.string()]),
  result: z.record(z.string(), z.unknown()),
});

export const RPC_ERROR = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});

const TOOL_RESULT = z.object({
  content: z.array(z.record(z.string(), z.unknown())),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
  isError: z.boolean(),
});

export type ToolResult = z.infer<typeof TOOL_RESULT>;

const TOKENS = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number(),
  refresh_token: z.string(),
  scope: z.string(),
});

export type Tokens = z.infer<typeof TOKENS>;

const REGISTERED = z.object({ client_id: z.string(), client_secret: z.string().optional() });

let nextId = 0;

export function rpc(
  base: string,
  token: string | null,
  message: Record<string, unknown>,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  nextId += 1;
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-11-25',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId, ...message }),
  });
}

export async function resultOf(response: Response): Promise<Record<string, unknown>> {
  expect(response.status).toBe(200);
  return RESULT.parse(await response.json()).result;
}

export async function callTool(
  base: string,
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const response = await rpc(base, token, {
    method: 'tools/call',
    params: { name, arguments: args },
  });
  return TOOL_RESULT.parse(await resultOf(response));
}

export function structured(result: ToolResult): Record<string, unknown> {
  expect(result.isError, JSON.stringify(result.content)).toBe(false);
  return z.record(z.string(), z.unknown()).parse(result.structuredContent);
}

export function postForm(
  base: string,
  path: string,
  fields: Readonly<Record<string, string>>,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export async function register(
  base: string,
  metadata: Record<string, unknown> = {},
): Promise<{ clientId: string; secret: string | undefined }> {
  const response = await fetch(`${base}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Claude',
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      ...metadata,
    }),
  });
  expect(response.status).toBe(201);
  const body = REGISTERED.parse(await response.json());
  return { clientId: body.client_id, secret: body.client_secret };
}

export function authorizeUrl(base: string, query: Readonly<Record<string, string>>): string {
  return `${base}/oauth/authorize?${new URLSearchParams(query).toString()}`;
}

function requestIdIn(html: string): string {
  const id = /name="request" value="([0-9a-f]{64})"/.exec(html)?.[1];
  expect(id).toBeDefined();
  return id ?? '';
}

export async function approvalCode(booted: Booted): Promise<string> {
  const response = await fetch(`${booted.base}/oauth/approval-code`, {
    method: 'POST',
    headers: { authorization: `Bearer ${booted.owner}` },
  });
  expect(response.status).toBe(200);
  return MCP_APPROVAL_CODE.parse(await response.json()).code;
}

export async function consentPage(
  base: string,
  clientId: string,
  challenge: string,
): Promise<string> {
  const page = await fetch(
    authorizeUrl(base, {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'state-1',
      scope: 'mcp',
      resource: `${PUBLIC_URL}/mcp`,
    }),
  );
  expect(page.status).toBe(200);
  return requestIdIn(await page.text());
}

export async function approvedCode(
  booted: Booted,
  clientId: string,
  challenge: string,
): Promise<string> {
  const request = await consentPage(booted.base, clientId, challenge);
  const approved = await postForm(booted.base, '/oauth/authorize', {
    request,
    approval: await approvalCode(booted),
    decision: 'approve',
  });
  expect(approved.status).toBe(303);
  const location = new URL(approved.headers.get('location') ?? '');
  expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
  expect(location.searchParams.get('state')).toBe('state-1');
  expect(location.searchParams.get('iss')).toBe(PUBLIC_URL);
  return location.searchParams.get('code') ?? '';
}

export async function tokensFrom(response: Response): Promise<Tokens> {
  expect(response.status).toBe(200);
  return TOKENS.parse(await response.json());
}

export async function connect(booted: Booted): Promise<{ clientId: string; tokens: Tokens }> {
  const { clientId } = await register(booted.base);
  const { verifier, challenge } = pkce();
  const code = await approvedCode(booted, clientId, challenge);
  const tokens = await tokensFrom(
    await postForm(booted.base, '/oauth/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
      resource: `${PUBLIC_URL}/mcp`,
    }),
  );
  return { clientId, tokens };
}

export async function oauthError(response: Response): Promise<{ status: number; error: string }> {
  const body = z.object({ error: z.string() }).parse(await response.json());
  return { status: response.status, error: body.error };
}

export interface Running {
  readonly booted: Booted;
  readonly stop: () => Promise<void>;
}

export async function bootHome(verified: boolean): Promise<Running> {
  captureLogs();
  const directory = await temporaryDirectory();
  const booted = await bootServer(directory.path);
  if (verified) {
    await verifiedPublicUrl(booted);
  }
  return {
    booted,
    stop: async (): Promise<void> => {
      await booted.server.stop();
      await directory.remove();
    },
  };
}
