export const DETAIL_TABS = ['overview', 'activity', 'files', 'branches', 'tools'] as const;

export type DetailTab = (typeof DETAIL_TABS)[number];

export interface DetailsTarget {
  readonly tab: DetailTab;
  readonly agent: string | null;
}

export interface DetailsParams {
  readonly section?: string | undefined;
  readonly agent?: string | undefined;
}

export const OVERVIEW_TARGET: DetailsTarget = { tab: 'overview', agent: null };

const isTab = (value: string | undefined): value is DetailTab =>
  DETAIL_TABS.some((tab) => tab === value);

export function detailsTargetOf({ section, agent }: DetailsParams): DetailsTarget {
  if (agent !== undefined) {
    return { tab: 'activity', agent };
  }
  return { tab: isTab(section) ? section : 'overview', agent: null };
}
