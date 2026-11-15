import type { PhotoRailCounts, LibraryFilter, PhotoSource } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export const LIBRARY_TAB_IDS = [
  'all',
  'favourites',
  'videos',
  'screenshots',
  'device',
  'cameras',
  'ai',
] as const;

export type FixedTabId = (typeof LIBRARY_TAB_IDS)[number];

export type PartnerTabId = `partner-${string}`;

export type LibraryTabId = FixedTabId | PartnerTabId;

const PARTNER_PREFIX = 'partner-';

export function partnerTabIdOf(shareId: string): PartnerTabId {
  return `${PARTNER_PREFIX}${shareId}`;
}

export function isPartnerTabId(id: LibraryTabId): id is PartnerTabId {
  return id.startsWith(PARTNER_PREFIX);
}

export type LibraryTab =
  | {
      readonly id: FixedTabId;
      readonly label: string;
      readonly icon?: IconName;
      readonly kind: 'hub';
      readonly filter: LibraryFilter;
    }
  | {
      readonly id: FixedTabId;
      readonly label: string;
      readonly icon?: IconName;
      readonly kind: 'source';
      readonly source: PhotoSource;
    }
  | {
      readonly id: FixedTabId;
      readonly label: string;
      readonly icon?: IconName;
      readonly kind: 'device';
    }
  | {
      readonly id: PartnerTabId;
      readonly label: string;
      readonly icon?: IconName;
      readonly kind: 'partner';
      readonly shareId: string;
      readonly sharerId: string;
    };

export interface PartnerTabSource {
  readonly id: string;
  readonly sharerId: string;
  readonly name: string;
}

export function partnerTabsOf(shares: readonly PartnerTabSource[]): readonly LibraryTab[] {
  return shares.map((share) => ({
    id: partnerTabIdOf(share.id),
    label: share.name,
    icon: 'users',
    kind: 'partner',
    shareId: share.id,
    sharerId: share.sharerId,
  }));
}

export const LIBRARY_TABS: readonly LibraryTab[] = [
  { id: 'all', label: 'All', kind: 'hub', filter: 'all' },
  { id: 'favourites', label: 'Favourites', icon: 'star', kind: 'hub', filter: 'favourites' },
  { id: 'videos', label: 'Videos', icon: 'film', kind: 'hub', filter: 'videos' },
  { id: 'screenshots', label: 'Screenshots', icon: 'image', kind: 'hub', filter: 'screenshots' },
  { id: 'device', label: 'On this device', icon: 'smartphone', kind: 'device' },
  { id: 'cameras', label: 'Cameras', icon: 'camera', kind: 'source', source: 'cameras' },
  { id: 'ai', label: 'Made with AI', icon: 'sparkles', kind: 'source', source: 'ai' },
];

export type PhotosPage =
  | 'people'
  | 'albums'
  | 'sharing'
  | 'map'
  | 'folders'
  | 'insights'
  | 'archive'
  | 'locked'
  | 'deleted';

export const TAB_PARAM = 'tab';

export function tabsOf(hasLocalSource: boolean): readonly LibraryTab[] {
  return hasLocalSource ? LIBRARY_TABS : LIBRARY_TABS.filter((tab) => tab.kind !== 'device');
}

export function tabById(id: LibraryTabId): LibraryTab {
  const tab = LIBRARY_TABS.find((entry) => entry.id === id);
  if (tab === undefined) throw new RangeError(`${id} is not a Library tab`);
  return tab;
}

export function tabOfParam(raw: unknown, hasLocalSource: boolean): LibraryTabId {
  const tab = tabsOf(hasLocalSource).find((entry) => entry.id === raw);
  return tab === undefined ? 'all' : tab.id;
}

export function tabParamOf(id: LibraryTabId): string | null {
  return id === 'all' ? null : id;
}

export interface TabCountInput {
  readonly rail: PhotoRailCounts | undefined;
  readonly cameras: number | undefined;
  readonly ai: number | undefined;
  readonly device: number | undefined;
}

const COUNTS: Readonly<Record<FixedTabId, (input: TabCountInput) => number | null>> = {
  all: (input) => input.rail?.library ?? null,
  favourites: (input) => input.rail?.favourites ?? null,
  videos: (input) => input.rail?.videos ?? null,
  screenshots: (input) => input.rail?.screenshots ?? null,
  device: (input) => input.device ?? null,
  cameras: (input) => input.cameras ?? null,
  ai: (input) => input.ai ?? null,
};

export function tabCountOf(id: LibraryTabId, input: TabCountInput): number | null {
  return isPartnerTabId(id) ? null : COUNTS[id](input);
}
