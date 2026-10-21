import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { linkFakeProvider, pairPhone, type Booted } from '../support/booted';
import { call } from '../support/server';
import {
  bootHome,
  type Running,
  PUBLIC_URL,
  REDIRECT_URI,
  approvalCode,
  answerOf,
  approvedCode,
  connect,
  consentPage,
  initialize,
  oauthError,
  pkce,
  postForm,
  register,
  resultOf,
  rpc,
  tokensFrom,
} from './client';

let running: Running;
let booted: Booted;

beforeEach(async () => {
  running = await bootHome(true);
  booted = running.booted;
});

afterEach(async () => {
  await running.stop();
});

const METADATA = `${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp`;

function refresh(clientId: string, refreshToken: string): Promise<Response> {
  return postForm(booted.base, '/oauth/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
}

async function pingStatus(token: string): Promise<number> {
  return (await rpc(booted.base, token, { method: 'ping' })).status;
}

describe('OAuth discovery', () => {
  it('publishes the protected resource and the authorization server it trusts', async () => {
    const resource = {
      resource: `${PUBLIC_URL}/mcp`,
      authorization_servers: [PUBLIC_URL],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp'],
      resource_name: 'SmartEverything',
    };
    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]) {
      expect(await call(booted.base, null, { method: 'GET', path })).toStrictEqual({
        status: 200,
        body: resource,
      });
    }
    expect(
      await call(booted.base, null, {
        method: 'GET',
        path: '/.well-known/oauth-authorization-server',
      }),
    ).toStrictEqual({
      status: 200,
      body: {
        issuer: PUBLIC_URL,
        authorization_endpoint: `${PUBLIC_URL}/oauth/authorize`,
        token_endpoint: `${PUBLIC_URL}/oauth/token`,
        registration_endpoint: `${PUBLIC_URL}/oauth/register`,
        revocation_endpoint: `${PUBLIC_URL}/oauth/revoke`,
        response_types_supported: ['code'],
        response_modes_supported: ['query'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: [
          'none',
          'client_secret_post',
          'client_secret_basic',
        ],
        revocation_endpoint_auth_methods_supported: [
          'none',
          'client_secret_post',
          'client_secret_basic',
        ],
        scopes_supported: ['mcp'],
        authorization_response_iss_parameter_supported: true,
      },
    });
  });

  it('challenges a caller without a usable token towards the resource metadata', async () => {
    const anonymous = await rpc(booted.base, null, initialize());
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${METADATA}", scope="mcp"`,
    );
    const wrong = await rpc(booted.base, 'mca_nope', initialize());
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('www-authenticate')).toBe(
      `Bearer error="invalid_token", resource_metadata="${METADATA}", scope="mcp"`,
    );
    const device = await rpc(booted.base, booted.owner, { method: 'ping' });
    expect(device.status).toBe(401);
  });
});

describe('connecting an assistant', () => {
  it('registers, asks the owner, exchanges the code and calls tools with the access token', async () => {
    await linkFakeProvider(booted);
    const { clientId, tokens } = await connect(booted);
    expect(tokens.access_token).toMatch(/^mca_[0-9a-f]{64}$/);
    expect(tokens.refresh_token).toMatch(/^mcr_[0-9a-f]{64}$/);
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'mcp' });
    const initialized = await resultOf(
      await rpc(booted.base, tokens.access_token, initialize('2025-06-18')),
    );
    expect(initialized['protocolVersion']).toBe('2025-06-18');
    const devices = await call(booted.base, booted.owner, { method: 'GET', path: '/api/devices' });
    const lamp = API_ENDPOINTS.listDevices.response
      .parse(devices.body)
      .find((device) => device.external_id === 'lamp-1');
    const done = await resultOf(
      await rpc(booted.base, tokens.access_token, {
        method: 'tools/call',
        params: {
          name: 'device_control',
          arguments: {
            deviceIds: [lamp?.id], capability: 'brightness', value: 40,
          },
        },
      }),
    );
    expect(answerOf(done['content'])).toMatchObject({
      ok: true,
      changed: [{ capability: 'brightness' }],
    });
    const commands = API_ENDPOINTS.listCommands.response.parse(
      (await call(booted.base, booted.owner, { method: 'GET', path: '/api/commands' })).body,
    );
    const owner = API_ENDPOINTS.session.response.parse(
      (await call(booted.base, booted.owner, { method: 'GET', path: '/api/session' })).body,
    );
    expect(commands[0]).toMatchObject({ source: 'assistant', requested_by: owner.client.id });
    const grants = API_ENDPOINTS.listOAuthGrants.response.parse(
      (await call(booted.base, booted.owner, { method: 'GET', path: '/api/oauth/grants' })).body,
    );
    expect(grants.map((grant) => [grant.id, grant.name, grant.scopes])).toStrictEqual([
      [clientId, 'Claude', ['mcp']],
    ]);
  });

  it('rotates refresh tokens and revokes the whole connection when one is replayed', async () => {
    const { clientId, tokens } = await connect(booted);
    const second = await tokensFrom(await refresh(clientId, tokens.refresh_token));
    expect(second.refresh_token).not.toBe(tokens.refresh_token);
    expect(await pingStatus(second.access_token)).toBe(200);
    expect(await oauthError(await refresh(clientId, tokens.refresh_token))).toStrictEqual({
      status: 400,
      error: 'invalid_grant',
    });
    expect(await pingStatus(second.access_token)).toBe(401);
    expect(await pingStatus(tokens.access_token)).toBe(401);
    expect(await oauthError(await refresh(clientId, second.refresh_token))).toStrictEqual({
      status: 400,
      error: 'invalid_grant',
    });
  });

  it('revokes a connection through the revocation endpoint and through the owner grants', async () => {
    const first = await connect(booted);
    const revoked = await postForm(booted.base, '/oauth/revoke', {
      token: first.tokens.refresh_token,
      client_id: first.clientId,
    });
    expect(revoked.status).toBe(200);
    expect(await pingStatus(first.tokens.access_token)).toBe(401);
    const second = await connect(booted);
    const access = await postForm(booted.base, '/oauth/revoke', {
      token: second.tokens.access_token,
      client_id: second.clientId,
    });
    expect(access.status).toBe(200);
    expect(await pingStatus(second.tokens.access_token)).toBe(401);
    const third = await tokensFrom(await refresh(second.clientId, second.tokens.refresh_token));
    expect(await pingStatus(third.access_token)).toBe(200);
    const removed = await call(booted.base, booted.owner, {
      method: 'DELETE',
      path: `/api/oauth/grants/${second.clientId}`,
    });
    expect(removed.status).toBe(200);
    expect(await pingStatus(third.access_token)).toBe(401);
    expect(await oauthError(await refresh(second.clientId, third.refresh_token))).toStrictEqual({
      status: 400,
      error: 'invalid_grant',
    });
    const grants = await call(booted.base, booted.owner, {
      method: 'GET',
      path: '/api/oauth/grants',
    });
    expect(grants.body).toStrictEqual([
      expect.objectContaining({ id: first.clientId, revoked_at: null }),
    ]);
  });

  it('honours the revocation rules of RFC 7009 for unknown and foreign tokens', async () => {
    const mine = await connect(booted);
    const other = await connect(booted);
    const foreign = await postForm(booted.base, '/oauth/revoke', {
      token: mine.tokens.access_token,
      client_id: other.clientId,
    });
    expect(foreign.status).toBe(200);
    expect(await pingStatus(mine.tokens.access_token)).toBe(200);
    const unknown = await postForm(booted.base, '/oauth/revoke', {
      token: 'mca_unknown',
      client_id: other.clientId,
    });
    expect(unknown.status).toBe(200);
    expect(
      await oauthError(await postForm(booted.base, '/oauth/revoke', { client_id: other.clientId })),
    ).toStrictEqual({ status: 400, error: 'invalid_request' });
  });

  it('refuses a replayed authorization code and revokes what it issued', async () => {
    const { clientId } = await register(booted.base);
    const { verifier, challenge } = pkce();
    const code = await approvedCode(booted, clientId, challenge);
    const exchange = (): Promise<Response> =>
      postForm(booted.base, '/oauth/token', {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
      });
    const tokens = await tokensFrom(await exchange());
    expect(await oauthError(await exchange())).toStrictEqual({
      status: 400,
      error: 'invalid_grant',
    });
    expect(await pingStatus(tokens.access_token)).toBe(401);
  });
});

describe('the owner approval', () => {
  it('only an owner can show an approval code', async () => {
    const phone = await pairPhone(booted, 'member');
    const member = await fetch(`${booted.base}/oauth/approval-code`, {
      method: 'POST',
      headers: { authorization: `Bearer ${phone.token}` },
    });
    expect(member.status).toBe(403);
    const anonymous = await fetch(`${booted.base}/oauth/approval-code`, { method: 'POST' });
    expect(anonymous.status).toBe(401);
  });

  it('shows the consent page with strict headers and refuses a wrong or missing code', async () => {
    const { clientId } = await register(booted.base, { client_uri: 'https://claude.ai' });
    const { challenge } = pkce();
    const page = await fetch(
      `${booted.base}/oauth/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString()}`,
    );
    const html = await page.text();
    expect(html).toContain('Allow Claude to use Home?');
    expect(html).toContain('claude.ai');
    const policy = page.headers.get('content-security-policy') ?? '';
    const nonce = /script-src 'nonce-([A-Za-z0-9+/]+=*)'/.exec(policy)?.[1] ?? '';
    expect(nonce).not.toBe('');
    expect(html).toContain(`nonce="${nonce}"`);
    expect(policy.replace(nonce, 'NONCE')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-NONCE'; connect-src 'self'; form-action 'self' https://claude.ai; frame-ancestors 'none'; base-uri 'none'",
    );
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    const request = await consentPage(booted.base, clientId, challenge);
    const none = await postForm(booted.base, '/oauth/authorize', {
      request,
      approval: '123456',
      decision: 'approve',
    });
    expect(none.status).toBe(403);
    expect(await none.text()).toContain('No approval code is waiting');
    const code = await approvalCode(booted);
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    const refused = await postForm(booted.base, '/oauth/authorize', {
      request,
      approval: wrong,
      decision: 'approve',
    });
    expect(refused.status).toBe(403);
    expect(await refused.text()).toContain('That code is wrong.');
    const empty = await postForm(booted.base, '/oauth/authorize', { request, decision: 'approve' });
    expect(await empty.text()).toContain('Type the approval code');
    const neither = await postForm(booted.base, '/oauth/authorize', { request, approval: code });
    expect(neither.status).toBe(400);
    const approved = await postForm(booted.base, '/oauth/authorize', {
      request,
      approval: code.replace(/(...)/, '$1 '),
      decision: 'approve',
    });
    expect(approved.status).toBe(303);
    const reused = await postForm(booted.base, '/oauth/authorize', {
      request,
      approval: code,
      decision: 'approve',
    });
    expect(reused.status).toBe(400);
  });

  it('accepts the consent form from the public URL and refuses every other origin', async () => {
    const { clientId } = await register(booted.base);
    const request = await consentPage(booted.base, clientId, pkce().challenge);
    const code = await approvalCode(booted);
    const fields = { request, approval: code, decision: 'approve' };
    const foreign = await postForm(booted.base, '/oauth/authorize', fields, {
      origin: 'https://evil.example',
    });
    expect(foreign.status).toBe(403);
    const mcp = await rpc(
      booted.base,
      null,
      { method: 'ping' },
      { origin: 'https://evil.example' },
    );
    expect(mcp.status).toBe(403);
    const own = await postForm(booted.base, '/oauth/authorize', fields, { origin: PUBLIC_URL });
    expect(own.status).toBe(303);
    expect(own.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('discards the approval code after five wrong tries', async () => {
    const { clientId } = await register(booted.base);
    const request = await consentPage(booted.base, clientId, pkce().challenge);
    const code = await approvalCode(booted);
    const wrong = String((Number(code) + 7) % 1_000_000).padStart(6, '0');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await postForm(booted.base, '/oauth/authorize', {
        request,
        approval: wrong,
        decision: 'approve',
      });
    }
    const late = await postForm(booted.base, '/oauth/authorize', {
      request,
      approval: code,
      decision: 'approve',
    });
    expect(late.status).toBe(403);
    expect(await late.text()).toContain('No approval code is waiting');
  });

  it('accepts an owner token instead of the code and refuses a member token', async () => {
    const { clientId } = await register(booted.base);
    const request = await consentPage(booted.base, clientId, pkce().challenge);
    const phone = await pairPhone(booted, 'member');
    const member = await postForm(booted.base, '/oauth/authorize', {
      request,
      approval: phone.token,
      decision: 'approve',
    });
    expect(member.status).toBe(403);
    const owner = await postForm(booted.base, '/oauth/authorize', {
      request,
      approval: booted.owner,
      decision: 'approve',
    });
    expect(owner.status).toBe(303);
  });

  it('sends a denial back to the assistant', async () => {
    const { clientId } = await register(booted.base);
    const request = await consentPage(booted.base, clientId, pkce().challenge);
    const denied = await postForm(booted.base, '/oauth/authorize', { request, decision: 'deny' });
    expect(denied.status).toBe(303);
    const location = new URL(denied.headers.get('location') ?? '');
    expect(Object.fromEntries(location.searchParams)).toStrictEqual({
      error: 'access_denied',
      state: 'state-1',
      iss: PUBLIC_URL,
    });
    const grants = await call(booted.base, booted.owner, {
      method: 'GET',
      path: '/api/oauth/grants',
    });
    expect(grants.body).toStrictEqual([]);
  });
});
