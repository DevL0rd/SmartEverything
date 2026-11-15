import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import type { RailEntry } from '../../../components/page-shell/section-rail';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import { DOMAIN_INFO, FITNESS_DOMAINS, type FitnessDomain } from '../model/domains';
import type { FitnessTab } from '../model/section-routes';

const PHONE_TABS: readonly FitnessTab[] = ['today', 'activity', 'nutrition', 'heart', 'sleep'];

const TODAY_ENTRY: RailEntry = {
  id: 'today',
  label: 'Today',
  icon: 'fitness',
  missing: null,
  detail: null,
};

function domainEntry(domain: FitnessDomain): RailEntry {
  const info = DOMAIN_INFO[domain];
  return { id: domain, label: info.title, icon: info.icon, missing: null, detail: null };
}

export function fitnessHrefOf(id: string): AppHref {
  const domain = FITNESS_DOMAINS.find((entry) => entry === id);
  return domain === undefined ? href.fitness() : href.fitnessPage(domain);
}

export function fitnessSectionsOf(
  active: FitnessTab,
  present: ReadonlySet<FitnessDomain>,
): ShellSections {
  const domains = FITNESS_DOMAINS.filter(
    (domain) => present.has(domain) || domain === active || domain === 'nutrition',
  );
  return {
    label: 'Fitness sections',
    active,
    hrefOf: fitnessHrefOf,
    navigation: 'replace',
    phoneTabs: PHONE_TABS,
    groups: [{ title: null, entries: [TODAY_ENTRY, ...domains.map(domainEntry)] }],
  };
}
