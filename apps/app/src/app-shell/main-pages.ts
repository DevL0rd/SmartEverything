import type { PageSettingsLink } from '../components/page-settings-button';
import { settingsPage } from '../settings/tree';
import { href } from './hrefs';

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

function pageOf(tab: MainPageKey): (typeof MAIN_PAGES)[number] {
  const page = MAIN_PAGES.find((entry) => entry.tab === tab);
  if (page === undefined) {
    throw new Error(`The main page ${tab} has no definition.`);
  }
  return page;
}

export function mainPageSettings(tab: MainPageKey): PageSettingsLink {
  const page = pageOf(tab);
  if ('settingsIndex' in page) {
    return { href: href.settings.index(), label: 'Settings' };
  }
  const settings = settingsPage(page.settings);
  if (settings === undefined) {
    throw new Error(`The settings page ${page.settings} is not in the settings tree.`);
  }
  return { href: href.settings.page(settings.id), label: settings.title };
}
