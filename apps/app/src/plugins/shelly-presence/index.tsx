import { EnrollmentSettings } from './enrollment-settings';
import { SHELLY_PAGES, SHELLY_PLUGIN_ID } from '@smarteverything/shelly';
import type { AppPlugin } from '../contract';
import { isPresence, isPhysicalPresence } from './presence-data';
import { PresenceCard } from './presence-card';
import { PresenceHero, PresenceOverview } from './presence-overview';
import { ZoneOverview } from './zone-overview';
import { PresenceSettings } from './presence-settings';
import { presenceSearch } from './presence-search';
import { PresencePage } from './presence-page';
import { PRESENCE_PAGE_ICONS } from './presence-pages';

const ENROLLMENT_SEARCH = [
  ['discover', 'Discover configured Shelly sensors'],
  ['password', 'Local access password'],
  ['connect', 'Connect configured sensor'],
  ['sensors', 'Connected sensors'],
  ['forget', 'Forget sensor'],
] as const;

export const shellyPresenceAppPlugin: AppPlugin = {
  id: SHELLY_PLUGIN_ID,
  widgets: [],
  deviceSections: [],
  deviceCards: [
    {
      key: 'presence',
      groupChildren: true,
      applies: isPresence,
      render: (device, _size, showRoom) => <PresenceCard device={device} showRoom={showRoom} />,
      cell: (device, frame) => <PresenceCard device={device} frame={frame} />,
      hero: (device) => <PresenceHero device={device} />,
    },
  ],
  deviceOverviews: [
    {
      key: 'presence',
      applies: isPresence,
      render: (device) =>
        device.parent_id === null ? (
          <PresenceOverview device={device} />
        ) : (
          <ZoneOverview device={device} />
        ),
    },
  ],
  deviceSettings: [
    {
      key: 'presence',
      applies: isPresence,
      render: (device) => <PresenceSettings device={device} />,
    },
  ],
  devicePages: {
    pages: SHELLY_PAGES.map((page) => ({
      id: page.id,
      title: page.title,
      subtitle: page.keywords.join(', '),
      icon: PRESENCE_PAGE_ICONS[page.id] ?? 'settings',
      keywords: page.keywords,
      settings: [],
      applies: isPhysicalPresence,
      render: (device) => <PresencePage device={device} page={page.id} />,
    })),
    search: presenceSearch,
  },
  settingsSearch: ENROLLMENT_SEARCH.map(([id, title]) => ({
    id,
    title,
    keywords: ['Shelly', 'Presence', 'connect', title],
  })),
  settings: () => <EnrollmentSettings />,
};
