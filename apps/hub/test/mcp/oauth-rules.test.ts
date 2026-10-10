import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifiedPublicUrl, type Booted } from '../support/booted';
import { call } from '../support/server';
import {
  bootHome,
  type Running,
  PUBLIC_URL,
  REDIRECT_URI,
  approvedCode,
  authorizeUrl,
  oauthError,
  pkce,
  postForm,
  register,
  tokensFrom,
} from './client';

let running: Running;
let booted: Booted;

beforeEach(async () => {
  running = await bootHome(false);
  booted = running.booted;
});

afterEach(async () => {
  await running.stop();
});

async function registration(body: unknown, type = 'application/json'): Promise<Response> {
  return fetch(`${booted.base}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': type },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function redirectedError(query: Readonly<Record<string, string>>): Promise<string | null> {
  const response = await fetch(authorizeUrl(booted.base, query), { redirect: 'manual' });
  expect(response.status).toBe(303);
  const location = new URL(response.headers.get('location') ?? '');
  expect(location.searchParams.get('iss')).toBe(PUBLIC_URL);
  return location.searchParams.get('error');
}

describe('before the public URL is verified', () => {
  it('offers no metadata, registration or MCP endpoint', async () => {
    for (const path of [
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-protected-resource',
    ]) {
      expect(await call(booted.base, null, { method: 'GET', path })).toMatchObject({
        status: 422,
        body: { error: { code: 'public_url_not_verified' } },
      });
    }
    const mcp = await fetch(`${booted.base}/mcp`, { method: 'POST', body: '{}' });
    expect(mcp.status).toBe(422);
  });
});

describe('dynamic client registration', () => {
  beforeEach(async () => {
    await verifiedPublicUrl(booted);
  });

  it('defaults to client_secret_basic and returns the secret once', async () => {
    const response = await registration({
      redirect_uris: ['http://127.0.0.1:33418/callback', 'http://localhost/cb'],
    });
    expect(response.status).toBe(201);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      client_name: '127.0.0.1:33418',
      redirect_uris: ['http://127.0.0.1:33418/callback', 'http://localhost/cb'],
      token_endpoint_auth_method: 'client_secret_basic',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'mcp',
      client_secret_expires_at: 0,
    });
    expect(body).toHaveProperty('client_secret', expect.stringMatching(/^mcs_[0-9a-f]{64}$/));
  });

  it('refuses redirect URIs that could leak a code and metadata it cannot honour', async () => {
    for (const uri of [
      'http://claude.ai/callback',
      'https://claude.ai/callback#fragment',
      'https://user:pass@claude.ai/callback',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(await oauthError(await registration({ redirect_uris: [uri] })), uri).toStrictEqual({
        status: 400,
        error: 'invalid_redirect_uri',
      });
    }
    expect(await oauthError(await registration({ redirect_uris: [] }))).toStrictEqual({
      status: 400,
      error: 'invalid_redirect_uri',
    });
    for (const metadata of [
      { scope: 'mcp admin' },
      { token_endpoint_auth_method: 'private_key_jwt' },
      { grant_types: ['refresh_token'] },
      { response_types: ['token'] },
      { client_uri: 'http://claude.ai' },
    ]) {
      expect(
        await oauthError(await registration({ redirect_uris: [REDIRECT_URI], ...metadata })),
        JSON.stringify(metadata),
      ).toStrictEqual({ status: 400, error: 'invalid_client_metadata' });
    }
    expect(await oauthError(await registration('{', 'application/json'))).toStrictEqual({
      status: 400,
      error: 'invalid_client_metadata',
    });
    expect(await oauthError(await registration('redirect_uris=x', 'text/plain'))).toStrictEqual({
      status: 400,
      error: 'invalid_client_metadata',
    });
  });

  it('stops registering once fifty assistants wait for approval', async () => {
    for (let index = 0; index < 50; index += 1) {
      await register(booted.base);
    }
    expect(await oauthError(await registration({ redirect_uris: [REDIRECT_URI] }))).toStrictEqual({
      status: 429,
      error: 'temporarily_unavailable',
    });
    booted.moveClock(61 * 60_000);
    expect((await registration({ redirect_uris: [REDIRECT_URI] })).status).toBe(201);
  });
});

describe('authorization requests', () => {
  let clientId: string;
  const challenge = pkce().challenge;

  beforeEach(async () => {
    await verifiedPublicUrl(booted);
    clientId = (await register(booted.base)).clientId;
  });

  function query(change: Readonly<Record<string, string | null>>): Record<string, string> {
    const base: Record<string, string | null> = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...change,
    };
    return Object.fromEntries(
      Object.entries(base).flatMap(([key, value]) => (value === null ? [] : [[key, value]])),
    );
  }

  it('never redirects to an unregistered client or redirect URI', async () => {
    for (const change of [
      { client_id: 'unknown' },
      { client_id: null },
      { redirect_uri: 'https://evil.example/callback' },
      { redirect_uri: null },
    ]) {
      const response = await fetch(authorizeUrl(booted.base, query(change)), {
        redirect: 'manual',
      });
      expect(response.status, JSON.stringify(change)).toBe(400);
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await response.text()).toContain('This connection cannot continue');
    }
  });

  it('sends every other mistake back to the assistant as an OAuth error', async () => {
    expect(await redirectedError(query({ response_type: 'token' }))).toBe(
      'unsupported_response_type',
    );
    expect(await redirectedError(query({ code_challenge_method: 'plain' }))).toBe(
      'invalid_request',
    );
    expect(await redirectedError(query({ code_challenge_method: null }))).toBe('invalid_request');
    expect(await redirectedError(query({ code_challenge: 'short' }))).toBe('invalid_request');
    expect(await redirectedError(query({ scope: 'mcp admin' }))).toBe('invalid_scope');
    expect(await redirectedError(query({ scope: ' ' }))).toBe('invalid_scope');
    expect(await redirectedError(query({ resource: 'https://other.example/mcp' }))).toBe(
      'invalid_target',
    );
  });

  it('refuses a code exchanged with the wrong verifier, redirect, client or resource', async () => {
    const { verifier, challenge: ownChallenge } = pkce();
    const other = (await register(booted.base)).clientId;
    const exchange = async (fields: Record<string, string>): Promise<unknown> => {
      const code = await approvedCode(booted, clientId, ownChallenge);
      return oauthError(
        await postForm(booted.base, '/oauth/token', {
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          code_verifier: verifier,
          ...fields,
        }),
      );
    };
    const refused = { status: 400, error: 'invalid_grant' };
    expect(await exchange({ code_verifier: pkce().verifier })).toStrictEqual(refused);
    expect(await exchange({ code_verifier: 'too-short' })).toStrictEqual(refused);
    expect(await exchange({ redirect_uri: 'https://claude.ai/other' })).toStrictEqual(refused);
    expect(await exchange({ client_id: other })).toStrictEqual(refused);
    expect(await exchange({ resource: 'https://other.example/mcp' })).toStrictEqual({
      status: 400,
      error: 'invalid_target',
    });
    expect(
      await oauthError(
        await postForm(booted.base, '/oauth/token', {
          grant_type: 'authorization_code',
          code: 'unknown',
          client_id: clientId,
          code_verifier: verifier,
        }),
      ),
    ).toStrictEqual(refused);
  });

  it('refuses unknown grant types, missing parameters and bodies that are not forms', async () => {
    expect(
      await oauthError(
        await postForm(booted.base, '/oauth/token', {
          grant_type: 'client_credentials',
          client_id: clientId,
        }),
      ),
    ).toStrictEqual({ status: 400, error: 'unsupported_grant_type' });
    expect(
      await oauthError(
        await postForm(booted.base, '/oauth/token', {
          grant_type: 'authorization_code',
          client_id: clientId,
        }),
      ),
    ).toStrictEqual({ status: 400, error: 'invalid_request' });
    const json = await fetch(`${booted.base}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code' }),
    });
    expect(await oauthError(json)).toStrictEqual({ status: 400, error: 'invalid_request' });
    expect(
      await oauthError(
        await postForm(booted.base, '/oauth/token', { grant_type: 'refresh_token' }),
      ),
    ).toStrictEqual({ status: 401, error: 'invalid_client' });
  });
});

describe('confidential clients', () => {
  beforeEach(async () => {
    await verifiedPublicUrl(booted);
  });

  async function exchanged(
    method: 'client_secret_basic' | 'client_secret_post',
    present: (
      clientId: string,
      secret: string,
    ) => { fields: Record<string, string>; headers: Record<string, string> },
  ): Promise<Response> {
    const { clientId, secret } = await register(booted.base, {
      token_endpoint_auth_method: method,
    });
    const { verifier, challenge } = pkce();
    const code = await approvedCode(booted, clientId, challenge);
    const credentials = present(clientId, secret ?? '');
    return postForm(
      booted.base,
      '/oauth/token',
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
        ...credentials.fields,
      },
      credentials.headers,
    );
  }

  function basic(clientId: string, secret: string): Record<string, string> {
    return {
      authorization: `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`).toString('base64')}`,
    };
  }

  it('authenticates with HTTP Basic or with the secret in the body, as registered', async () => {
    await tokensFrom(
      await exchanged('client_secret_basic', (id, secret) => ({
        fields: {},
        headers: basic(id, secret),
      })),
    );
    await tokensFrom(
      await exchanged('client_secret_post', (id, secret) => ({
        fields: { client_id: id, client_secret: secret },
        headers: {},
      })),
    );
  });

  it('refuses a wrong secret, another method or no secret at all', async () => {
    const wrong = await exchanged('client_secret_basic', (id) => ({
      fields: {},
      headers: basic(id, 'mcs_wrong'),
    }));
    expect(wrong.headers.get('www-authenticate')).toBe('Basic realm="SmartEverything"');
    expect(await oauthError(wrong)).toStrictEqual({ status: 401, error: 'invalid_client' });
    const otherMethod = await exchanged('client_secret_basic', (id, secret) => ({
      fields: { client_id: id, client_secret: secret },
      headers: {},
    }));
    expect(await oauthError(otherMethod)).toStrictEqual({ status: 401, error: 'invalid_client' });
    const bare = await exchanged('client_secret_post', (id) => ({
      fields: { client_id: id },
      headers: {},
    }));
    expect(await oauthError(bare)).toStrictEqual({ status: 401, error: 'invalid_client' });
    const malformed = await exchanged('client_secret_basic', () => ({
      fields: {},
      headers: { authorization: `Basic ${Buffer.from('no-colon').toString('base64')}` },
    }));
    expect(await oauthError(malformed)).toStrictEqual({ status: 401, error: 'invalid_client' });
    const undecodable = await exchanged('client_secret_basic', () => ({
      fields: {},
      headers: { authorization: `Basic ${Buffer.from('%E0%A4%A:x').toString('base64')}` },
    }));
    expect(await oauthError(undecodable)).toStrictEqual({ status: 401, error: 'invalid_client' });
  });
});
