import type { SignalInput } from '../signals';
import type { MatcherVariant } from './triggers-device';

const PHONE_STATE = { source: 'device', kind: 'state', match: { family: 'phone' } } as const;

export const PHONE_STATE_EVENTS: Readonly<Record<string, MatcherVariant>> = {
  charger_plugged: { ...PHONE_STATE, field: 'charging', test: { is: 'eq', to: true } },
  charger_unplugged: { ...PHONE_STATE, field: 'charging', test: { is: 'eq', to: false } },
  call_started: { ...PHONE_STATE, field: 'in_call', test: { is: 'eq', to: true } },
  call_ended: { ...PHONE_STATE, field: 'in_call', test: { is: 'eq', to: false } },
  notification_count_changed: { ...PHONE_STATE, field: 'notification_count' },
};

export function phoneStateEventName(
  signal: Pick<SignalInput, 'kind' | 'field' | 'value'>,
): string | undefined {
  if (signal.kind !== 'state') return undefined;
  return Object.entries(PHONE_STATE_EVENTS).find(
    ([, variant]) =>
      variant.field === signal.field &&
      (variant.test?.is !== 'eq' || variant.test.to === signal.value),
  )?.[0];
}
