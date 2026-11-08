import type { ReactNode } from 'react';
import { useNavigation, useRouter } from 'expo-router';
import { TabsBar, type TabItem } from '../../../components/tabs-bar';
import type { PlannerSection } from '../model/section-routes';
import { openPlannerSection } from './open-section';
import { PLANNER_SECTION_DEFS } from './sections';

const PHONE_TABS = PLANNER_SECTION_DEFS.filter((def) => def.phoneTab);

export function PlannerTabs({ active }: { readonly active: PlannerSection }): ReactNode {
  const router = useRouter();
  const navigation = useNavigation();
  const items: TabItem[] = PHONE_TABS.map((def) => ({
    key: def.id,
    label: def.label,
    onPress: (): void => {
      openPlannerSection({ section: def.id, active, navigation, router });
    },
  }));
  return <TabsBar items={items} active={active} label="Planner sections" />;
}
