import type { PhoneTier } from '@smarteverything/domain';

export type PageAccess = 'full' | 'totals' | 'locked';

const ACCESS: Readonly<Record<PhoneTier, PageAccess>> = {
  person: 'full',
  owner: 'totals',
  member: 'locked',
};

export function pageAccessOf(tier: PhoneTier): PageAccess {
  return ACCESS[tier];
}
