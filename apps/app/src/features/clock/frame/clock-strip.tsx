import type { ReactNode } from 'react';
import { useNavigation, useRouter } from 'expo-router';
import { TabsBar, type TabItem } from '../../../components/tabs-bar';
import type { ClockSection } from '../model/section-routes';
import { openClockSection } from './open-section';
import { CLOCK_SECTION_DEFS } from './sections';

export function ClockStrip({ active }: { readonly active: ClockSection }): ReactNode {
  const router = useRouter();
  const navigation = useNavigation();
  const items: TabItem[] = CLOCK_SECTION_DEFS.map((def) => ({
    key: def.id,
    label: def.short,
    icon: def.icon,
    onPress: (): void => {
      openClockSection({ section: def.id, active, navigation, router });
    },
  }));
  return <TabsBar items={items} active={active} label="Clock sections" />;
}
