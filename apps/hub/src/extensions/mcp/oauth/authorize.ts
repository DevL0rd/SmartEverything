import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, MCP_SCOPE, type McpConsentDecision } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { OAuthClientAuth } from '../../../store/repositories/oauth';
import type { Store } from '../../../store/store';
import { readForm, redirect, single } from '../respond';
import { siteOf, type Site } from '../site';
import type { ApprovalCodes } from './approval';
import type { PendingConsents } from './consents';
import { sendConsent, sendProblem, type ConsentView } from './consent-page';
import { OAuthError, invalidRequest } from './errors';
import type { AuthorizationSessions, Grant, PendingRequest } from './sessions';

export interface AuthorizeOptions {
  readonly store: Store;
  readonly sessions: AuthorizationSessions;
  readonly approvals: ApprovalCodes;
  readonly consents: PendingConsents;
  readonly log: Logger;
}

const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

function scopesOf(asked: string | undefined): readonly string[] {
  if (asked === undefined) {
    return [MCP_SCOPE];
  }
  const scopes = asked.split(' ').filter((scope) => scope !== '');
  if (scopes.length === 0 || scopes.some((scope) => scope !== MCP_SCOPE)) {
    throw new OAuthError(400, 'invalid_scope', `Only the ${MCP_SCOPE} scope is offered.`);
  }
  return [MCP_SCOPE];
}

export function resourceOf(site: Site, asked: string | undefined): string {
  if (asked !== undefined && asked.replace(/\/+$/, '') !== site.resource) {
    throw new OAuthError(400, 'invalid_target', `This server only protects ${site.resource}.`);
  }
  return site.resource;
}

function grantOf(
  site: Site,
  query: URLSearchParams,
  fixed: Pick<Grant, 'clientId' | 'redirectUri' | 'state'>,
): Grant {
  if (single(query, 'response_type') !== 'code') {
    throw new OAuthError(400, 'unsupported_response_type', 'Only response_type=code is offered.');
  }
  const challenge = single(query, 'code_challenge');
  if (single(query, 'code_challenge_method') !== 'S256' || challenge === undefined) {
    throw invalidRequest('PKCE is required: send code_challenge with code_challenge_method=S256.');
  }
  if (!CODE_CHALLENGE.test(challenge)) {
    throw invalidRequest('The code_challenge is not a base64url SHA-256 digest.');
  }
  return {
    ...fixed,
    codeChallenge: challenge,
    scopes: scopesOf(single(query, 'scope')),
    resource: resourceOf(site, single(query, 'resource')),
  };
}

function backTo(
  site: Site,
  target: Pick<Grant, 'redirectUri' | 'state'>,
  values: Readonly<Record<string, string>>,
): string {
  const url = new URL(target.redirectUri);
  for (const [name, value] of Object.entries(values)) {
    url.searchParams.set(name, value);
  }
  if (target.state !== null) {
    url.searchParams.set('state', target.state);
  }
  url.searchParams.set('iss', site.issuer);
  return url.toString();
}

function registered(
  store: Store,
  clientId: string | undefined,
  redirectUri: string | undefined,
): OAuthClientAuth | string {
  const client = clientId === undefined ? undefined : store.oauth.findClient(clientId);
  if (client === undefined) {
    return 'This assistant is not registered with this server, or its registration expired.';
  }
  if (redirectUri === undefined || !client.row.redirect_uris.includes(redirectUri)) {
    return 'The redirect_uri is not one this assistant registered.';
  }
  return client;
}

function viewOf(
  options: AuthorizeOptions,
  pending: PendingRequest,
  client: OAuthClientAuth,
  problem: string | null,
): ConsentView {
  return {
    requestId: pending.id,
    homeName: options.store.settings.read().home_name,
    clientName: client.row.name,
    clientUri: client.row.uri,
    redirectUri: pending.redirectUri,
    problem,
  };
}

function askOwner(
  options: AuthorizeOptions,
  site: Site,
  pending: PendingRequest,
  client: OAuthClientAuth,
): void {
  const replaced = options.consents.open({
    pageId: pending.id,
    clientId: client.row.id,
    clientName: client.row.name,
    clientUri: client.row.uri,
    expiresAt: pending.expiresAt,
    expiredLocation: backTo(site, pending, {
      error: 'access_denied',
      error_description: 'The owner did not answer in time.',
    }),
  });
  for (const pageId of replaced) {
    options.sessions.close(pageId);
  }
  options.log.info('consent.requested', { clientId: client.row.id, replaced: replaced.length });
}

export function showConsent(
  options: AuthorizeOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const site = siteOf(options.store);
  const query = new URL(request.url ?? '/', site.issuer).searchParams;
  const redirectUri = single(query, 'redirect_uri');
  const client = registered(options.store, single(query, 'client_id'), redirectUri);
  if (typeof client === 'string' || redirectUri === undefined) {
    sendProblem(response, 400, typeof client === 'string' ? client : 'redirect_uri is missing.');
    return Promise.resolve();
  }
  const fixed = { clientId: client.row.id, redirectUri, state: single(query, 'state') ?? null };
  let grant: Grant;
  try {
    grant = grantOf(site, query, fixed);
  } catch (cause) {
    if (!(cause instanceof OAuthError)) {
      throw cause;
    }
    redirect(
      response,
      backTo(site, fixed, { error: cause.error, error_description: cause.message }),
    );
    return Promise.resolve();
  }
  const pending = options.sessions.open(grant);
  askOwner(options, site, pending, client);
  sendConsent(response, 200, viewOf(options, pending, client, null));
  return Promise.resolve();
}

function conclude(
  options: AuthorizeOptions,
  pending: PendingRequest,
  decision: McpConsentDecision,
): string {
  const site = siteOf(options.store);
  options.sessions.close(pending.id);
  if (decision === 'deny') {
    const location = backTo(site, pending, { error: 'access_denied' });
    options.consents.settle(pending.id, { outcome: 'denied', location });
    options.log.info('grant.denied', { clientId: pending.clientId });
    return location;
  }
  options.store.oauth.grant(pending.clientId, pending.scopes);
  const location = backTo(site, pending, { code: options.sessions.issueCode(pending) });
  options.consents.settle(pending.id, { outcome: 'allowed', location });
  options.log.info('grant.approved', { clientId: pending.clientId });
  return location;
}

export function decideInApp(
  options: AuthorizeOptions,
  consentId: string,
  decision: McpConsentDecision,
): void {
  const pageId = options.consents.pageOf(consentId);
  const pending = pageId === undefined ? undefined : options.sessions.find(pageId);
  if (pending === undefined) {
    if (pageId !== undefined) {
      options.consents.expire(pageId);
    }
    throw new ApiError(
      'not_found',
      'This assistant is no longer waiting: it was answered, expired or replaced by a newer request.',
    );
  }
  conclude(options, pending, decision);
}

export async function decideConsent(
  options: AuthorizeOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const form = await readForm(request);
  const requestId = single(form, 'request');
  const pending = requestId === undefined ? undefined : options.sessions.find(requestId);
  const client =
    pending === undefined ? undefined : options.store.oauth.findClient(pending.clientId);
  if (pending === undefined || client === undefined) {
    sendProblem(response, 400, 'This approval page expired or was already used.');
    return;
  }
  const decision = single(form, 'decision');
  if (decision === 'deny') {
    redirect(response, conclude(options, pending, 'deny'));
    return;
  }
  if (decision !== 'approve') {
    sendConsent(response, 400, viewOf(options, pending, client, 'Choose Approve or Deny.'));
    return;
  }
  const outcome = options.approvals.check(single(form, 'approval') ?? '');
  if (!outcome.approved) {
    options.log.warn('approval.refused', { clientId: pending.clientId });
    sendConsent(response, 403, viewOf(options, pending, client, outcome.reason));
    return;
  }
  redirect(response, conclude(options, pending, 'allow'));
}
