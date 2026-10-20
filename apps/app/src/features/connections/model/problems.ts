import {
  PROVIDER_INFO,
  type Provider,
  type ProviderLinkRow,
  type ProviderProblem,
} from '@smarteverything/domain';
import { joinParts, plural } from '../../../format/text';
import type { Tone } from '../../../components/tone';

function problemTitles(provider: Provider): Readonly<Record<ProviderProblem, string>> {
  const name = PROVIDER_INFO[provider].name;
  return {
    bad_credentials: provider === 'tuya' ? 'That code didn’t work' : 'Wrong account or password',
    permission_denied: `${name} refused access`,
    network: `Couldn’t reach ${name}`,
    session_expired: `${name} signed you out`,
    qr_expired: 'The code expired. Start again.',
    cancelled: 'Sign-in was cancelled',
    rate_limited: 'Too many tries. Wait a bit.',
    not_supported:
      provider === 'tuya' ? 'This app isn’t supported' : 'This account isn’t supported',
    unknown: 'That didn’t work',
  };
}

export function problemTitle(provider: Provider, problem: ProviderProblem): string {
  return problemTitles(provider)[problem];
}

export interface LinkSummary {
  readonly text: string;
  readonly tone: Tone;
}

const PHASE_TEXT = {
  signing_in: 'Signing in…',
  awaiting_answer: 'Waiting for you',
  discovering: 'Finding devices…',
} as const;

export function linkSummary(row: ProviderLinkRow): LinkSummary {
  if (row.prompt !== null) {
    return { text: 'Waiting for you', tone: 'primary' };
  }
  switch (row.status) {
    case 'linking':
      return { text: PHASE_TEXT[row.phase ?? 'signing_in'], tone: 'primary' };
    case 'linked':
      return {
        text: joinParts([row.account_label, plural(row.device_count, 'device')]),
        tone: 'variant',
      };
    case 'unlinked':
    case 'needs_attention':
      return { text: problemTitle(row.provider, row.problem ?? 'unknown'), tone: 'critical' };
  }
}

export function isAccount(row: ProviderLinkRow): boolean {
  return PROVIDER_INFO[row.provider].addable && row.status !== 'unlinked';
}
