import type { DeviceFamily } from '@smarteverything/domain';
import type { IconName } from '../components/icon';
import { MICROWAVE_SEARCH_ITEMS } from '../features/devices/microwave/search-items';

export interface FamilySearchItem {
  readonly key: string;
  readonly title: string;
  readonly page: 'overview' | 'controls';
  readonly icon: IconName;
  readonly keywords: readonly string[];
}

const FAMILY_SEARCH_ITEMS: Readonly<Partial<Record<DeviceFamily, readonly FamilySearchItem[]>>> = {
  microwave: MICROWAVE_SEARCH_ITEMS,
};

export function familySearchItems(family: DeviceFamily): readonly FamilySearchItem[] {
  return FAMILY_SEARCH_ITEMS[family] ?? [];
}
