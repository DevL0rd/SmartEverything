import type { ReactNode } from 'react';
import { useNavigation, useRouter } from 'expo-router';
import { TabsBar, type TabItem } from '../../../components/tabs-bar';
import { DOMAIN_INFO, FITNESS_DOMAINS } from '../model/domains';
import type { FitnessTab } from '../model/section-routes';
import { openSection } from './open-section';
import { useToday } from '../data/day';
import { useHealthPresence } from '../data/presence';

export function FitnessTabs({ active }: { readonly active: FitnessTab }): ReactNode {
  const router = useRouter();
  const navigation = useNavigation();
  const presence = useHealthPresence(useToday());
  const domains = FITNESS_DOMAINS.filter(
    (domain) => presence.domains.has(domain) || domain === active || domain === 'nutrition',
  );
  const open = (tab: FitnessTab) => (): void => {
    openSection({ tab, active, navigation, router });
  };
  const items: TabItem[] = [
    { key: 'today', label: 'Today', onPress: open('today') },
    ...domains.map((domain) => ({
      key: domain,
      label: DOMAIN_INFO[domain].title,
      onPress: open(domain),
    })),
  ];
  return <TabsBar items={items} active={active} label="Fitness sections" />;
}
