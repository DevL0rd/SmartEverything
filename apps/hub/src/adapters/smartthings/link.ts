import type { ProviderCredentials, ProviderProblem } from '@smarteverything/domain';
import {
  authorizationCodeBody,
  describeOAuthError,
  LOCATION_LIST,
  parseTokenResponse,
  SMARTTHINGS_API,
  type AccountSecrets,
} from '@smarteverything/smartthings';
import type { LinkContext, StoredAccount } from '../contract';
import { bodyOf, describeBody, JSON_ACCEPT, type SmartThingsIo } from './http';
import { requestTokens, type SmartThingsAppSource } from './tokens';

export class SmartThingsLinkError extends Error {
  override readonly name = 'SmartThingsLinkError';

  constructor(
    readonly step: string,
    readonly reason: string,
    readonly problem: ProviderProblem,
  ) {
    super(`Linking SmartThings failed while ${step}: ${reason}.`);
  }
}

async function locationNames(io: SmartThingsIo, accessToken: string): Promise<readonly string[]> {
  const response = await io.fetch(`${SMARTTHINGS_API}/v1/locations`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: JSON_ACCEPT },
  });
  const body = await bodyOf(response);
  if (!response.ok) {
    throw new SmartThingsLinkError(
      'reading the locations',
      `HTTP ${String(response.status)} ${describeBody(body)}`,
      'unknown',
    );
  }
  const parsed = LOCATION_LIST.safeParse(body);
  if (!parsed.success) {
    throw new SmartThingsLinkError('reading the locations', parsed.error.message, 'unknown');
  }
  return parsed.data.items.map((location) => location.name);
}

export async function linkSmartThings(
  credentials: Extract<ProviderCredentials, { provider: 'smartthings' }>,
  app: SmartThingsAppSource,
  io: SmartThingsIo,
  context: LinkContext,
): Promise<StoredAccount> {
  const config = app();
  const answer = await requestTokens(
    config,
    io,
    authorizationCodeBody(credentials.code, credentials.redirectUri, config.clientId),
  );
  if (!answer.ok) {
    throw new SmartThingsLinkError(
      'exchanging the authorization code',
      describeOAuthError(answer.status, answer.body),
      'bad_credentials',
    );
  }
  const tokens = parseTokenResponse(answer.body, io.now());
  const names = await locationNames(io, tokens.accessToken);
  const secrets: AccountSecrets = tokens;
  context.log.info('account.linked', { locations: names.length, scope: tokens.scope });
  return {
    label: names.length === 0 ? 'Samsung account' : names.join(', '),
    secrets: { ...secrets },
  };
}
