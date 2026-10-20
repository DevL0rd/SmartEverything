import type { ProviderLinkRow } from '../api/rows-home';
import { PROVIDER_PROBLEMS } from '../api/rows-home';
import { PROVIDERS } from '../devices';
import type { SignalMatchSpec, SignalSourceSpec } from './spec';

export const PROVIDER_STATES = ['linked', 'attention', 'down'] as const;

export type ProviderState = (typeof PROVIDER_STATES)[number];

export const PROVIDER_STATE_LABELS: Readonly<Record<ProviderState, string>> = {
  linked: 'Connected',
  attention: 'Needs you to sign in again',
  down: 'Not reachable',
};

export function providerStateOf(
  link: Pick<ProviderLinkRow, 'status' | 'problem'>,
): ProviderState | null {
  switch (link.status) {
    case 'linked':
      return 'linked';
    case 'needs_attention':
      return link.problem === 'network' ? 'down' : 'attention';
    case 'linking':
    case 'unlinked':
      return null;
  }
}

export function providerInOutage(state: ProviderState | null): boolean {
  return state === 'attention' || state === 'down';
}

export const PROVIDER_LINK_MATCH: readonly SignalMatchSpec[] = [
  {
    key: 'state',
    label: 'Connection state',
    values: PROVIDER_STATES,
    valueLabels: PROVIDER_STATE_LABELS,
  },
  { key: 'provider', label: 'Service', values: PROVIDERS },
  { key: 'problem', label: 'What went wrong', values: PROVIDER_PROBLEMS },
  { key: 'error', label: 'Last error', values: null },
];

export const PROVIDER_SIGNALS: SignalSourceSpec = {
  source: 'provider',
  label: 'Connections to services',
  kinds: [
    {
      kind: 'status',
      label: 'A service connection changes',
      subject: 'none',
      fields: [],
      match: PROVIDER_LINK_MATCH,
      pulse: false,
      feed: true,
    },
  ],
};
