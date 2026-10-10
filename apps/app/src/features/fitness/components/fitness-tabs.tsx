import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { TabsBar, type TabItem } from '../../../components/tabs-bar';
import { DOMAIN_INFO, FITNESS_DOMAINS, type FitnessDomain } from '../model/domains';
import { useToday } from '../data/day';
import { useHealthPresence } from '../data/presence';

export type FitnessTab = 'today' | FitnessDomain;

export function FitnessTabs({ active }: { readonly active: FitnessTab }): ReactNode {
  const router = useRouter();
  const presence = useHealthPresence(useToday());
  const domains = FITNESS_DOMAINS.filter(
    (domain) => presence.domains.has(domain) || domain === active || domain === 'nutrition',
  );
  const open = (tab: FitnessTab) => (): void => {
    if (tab === active) {
      return;
    }
    if (tab === 'today') {
      router.dismissTo(href.fitness());
      return;
    }
    if (active === 'today') {
      router.push(href.fitnessPage(tab));
      return;
    }
    router.replace(href.fitnessPage(tab));
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
