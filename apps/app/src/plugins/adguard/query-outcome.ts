import type { AdGuardQuery, QueryLogFilter } from '@smarteverything/domain';
import type { IconName } from '../../components/icon';
import type { Tone } from '../../components/tone';

export const OUTCOME_TEXT: Readonly<Record<AdGuardQuery['outcome'], string>> = {
  blocked: 'Blocked',
  allowed: 'Allowed',
  rewritten: 'Rewritten',
};

export const OUTCOME_LOOK: Readonly<
  Record<AdGuardQuery['outcome'], { readonly icon: IconName; readonly tone: Tone }>
> = {
  blocked: { icon: 'shield', tone: 'critical' },
  allowed: { icon: 'circleCheck', tone: 'faint' },
  rewritten: { icon: 'route', tone: 'variant' },
};

export const FILTER_LABEL: Readonly<Record<QueryLogFilter, string>> = {
  all: 'All',
  blocked: 'Blocked',
  allowed: 'Allowed',
};
