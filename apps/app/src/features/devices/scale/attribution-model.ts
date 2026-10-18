import type { Attribution } from '@smarteverything/domain';
import type { BadgeTone } from '../../../components/badge';

export interface AttributionLook {
  readonly label: string;
  readonly tone: BadgeTone;
}

const LOOKS: Readonly<Record<Attribution, AttributionLook>> = {
  person: { label: 'Confirmed', tone: 'primary' },
  scale: { label: 'Scale slot', tone: 'info' },
  only_profile: { label: 'Guessed', tone: 'neutral' },
  weight: { label: 'Guessed', tone: 'neutral' },
  pending: { label: 'Needs a person', tone: 'warning' },
  ignored: { label: 'Guest', tone: 'neutral' },
};

export function attributionLook(attribution: Attribution): AttributionLook {
  return LOOKS[attribution];
}
