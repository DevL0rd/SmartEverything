import type { PageSettingsLink } from '../components/page-settings-button';
import { href } from './hrefs';
import type { TabKey } from './route-types';

export const MAIN_PAGES = [
  { tab: 'home', settings: 'home', title: 'Home', settingsIndex: true },
  { tab: 'devices', settings: 'devices', title: 'Devices' },
  { tab: 'cameras', settings: 'cameras', title: 'Cameras' },
  { tab: 'fitness', settings: 'health', title: 'Fitness' },
  { tab: 'assistant', settings: 'assistant', title: 'Assistant' },
  { tab: 'talk', settings: 'talk', title: 'Walkie-talkie' },
  { tab: 'automations', settings: 'automations', title: 'Automations' },
] as const;

export type MainPageKey = (typeof MAIN_PAGES)[number]['tab'];

export const PAGE_ORDER: readonly TabKey[] = MAIN_PAGES.map((page) => page.tab);

export function mainPageSettings(tab: MainPageKey): PageSettingsLink {
  const page = MAIN_PAGES.find((entry) => entry.tab === tab);
  if (page === undefined) {
    throw new Error(`The main page ${tab} has no definition.`);
  }
  return {
    href: 'settingsIndex' in page ? href.settings.index() : href.settings.page(page.settings),
    label: 'settingsIndex' in page ? 'Settings' : `${page.title} settings`,
  };
}
