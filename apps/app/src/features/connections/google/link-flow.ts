import {
  ApiError,
  GOOGLE_PRODUCTS,
  type DesktopGoogleAnswer,
  type GoogleAccountRow,
} from '@smarteverything/domain';
import type { WebBrowserAuthSessionResult } from 'expo-web-browser';
import type { finishGoogleLink, GoogleLinkStarted, startGoogleLink } from '../../../api/google';
import { ANDROID_PACKAGE, type GoogleClientPlatform } from './google-app-setup';

export const ANDROID_REDIRECT_URI = `${ANDROID_PACKAGE}:/oauth2redirect`;

const REFUSED_CLIENT_REASONS: ReadonlySet<string> = new Set([
  'invalid_client',
  'unauthorized_client',
  'redirect_uri_mismatch',
]);

const LINK_PRODUCTS = GOOGLE_PRODUCTS.map((product) => ({ product, readOnly: false }));

export type GoogleConsentAnswer = DesktopGoogleAnswer;

export type GoogleLinkBegin = (redirectUri: string) => Promise<GoogleLinkStarted>;

export interface GoogleConsent {
  readonly platform: GoogleClientPlatform;
  readonly authorize: (begin: GoogleLinkBegin) => Promise<GoogleConsentAnswer>;
  readonly cancel: (() => Promise<void>) | null;
}

export interface GoogleLinkCalls {
  readonly start: typeof startGoogleLink;
  readonly finish: typeof finishGoogleLink;
}

export type GoogleLinkOutcome =
  | { readonly kind: 'linked'; readonly account: GoogleAccountRow }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'denied'; readonly reason: string }
  | { readonly kind: 'refused_client'; readonly platform: GoogleClientPlatform };

export class GoogleLinkStateMismatchError extends Error {
  override readonly name = 'GoogleLinkStateMismatchError';

  constructor() {
    super('the Google redirect does not belong to the link that was started');
  }
}

export function androidAnswer(
  result: WebBrowserAuthSessionResult,
  expectedState: string,
): GoogleConsentAnswer {
  if (!('url' in result)) return { kind: 'cancelled' };
  const query = new URL(result.url).searchParams;
  if (query.get('state') !== expectedState) throw new GoogleLinkStateMismatchError();
  const error = query.get('error');
  if (error !== null && error !== '') return { kind: 'denied', reason: error };
  const code = query.get('code');
  if (code === null || code === '') return { kind: 'denied', reason: 'no_code' };
  return { kind: 'code', code, state: expectedState, redirectUri: ANDROID_REDIRECT_URI };
}

export function deniedDetail(reason: string): string {
  return reason === 'access_denied'
    ? 'You didn’t allow SmartEverything to use your Google account.'
    : `Google answered ${reason}.`;
}

export function refusesClient(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.code === 'upstream_failed' &&
    error.reason !== null &&
    REFUSED_CLIENT_REASONS.has(error.reason)
  );
}

async function finished(
  calls: GoogleLinkCalls,
  personId: string,
  platform: GoogleClientPlatform,
  answer: Extract<GoogleConsentAnswer, { kind: 'code' }>,
): Promise<GoogleLinkOutcome> {
  const { code, state, redirectUri } = answer;
  try {
    return { kind: 'linked', account: await calls.finish(personId, { code, state, redirectUri }) };
  } catch (cause) {
    if (refusesClient(cause)) return { kind: 'refused_client', platform };
    throw cause;
  }
}

export async function runGoogleLink(
  consent: GoogleConsent,
  calls: GoogleLinkCalls,
  personId: string,
): Promise<GoogleLinkOutcome> {
  const { platform } = consent;
  const answer = await consent.authorize((redirectUri) =>
    calls.start(personId, { platform, redirectUri, products: LINK_PRODUCTS }),
  );
  switch (answer.kind) {
    case 'cancelled':
      return answer;
    case 'denied':
      return REFUSED_CLIENT_REASONS.has(answer.reason)
        ? { kind: 'refused_client', platform }
        : answer;
    case 'code':
      return finished(calls, personId, platform, answer);
  }
}
