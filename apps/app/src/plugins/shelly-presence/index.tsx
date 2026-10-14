import { EnrollmentSettings } from './enrollment-settings';
import { SHELLY_PRESENCE_PAGES, SHELLY_PRESENCE_PLUGIN_ID } from '@smarteverything/domain';
import type { AppPlugin } from '../contract';
import { isPresence, isPhysicalPresence } from './presence-data';
import { PresenceCard } from './presence-card';
import { PresenceHero, PresenceOverview } from './presence-overview';
import { ZoneOverview } from './zone-overview';
import { PresenceSettings } from './presence-settings';
import { presenceSearch } from './presence-search';
import { PresencePage } from './presence-page';

export const shellyPresenceAppPlugin: AppPlugin = {
  id: SHELLY_PRESENCE_PLUGIN_ID,
  widgets: [],
  deviceSections: [],
  deviceCards: [
    {
      key: 'presence',
      groupChildren: true,
      applies: isPresence,
      render: (device, size, showRoom) => (
        <PresenceCard device={device} size={size} showRoom={showRoom} />
      ),
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
  deviceSettingsPages: SHELLY_PRESENCE_PAGES.map((page) => ({
    id: page.id,
    applies: isPhysicalPresence,
    render: (device) => <PresencePage device={device} page={page.id} />,
  })),
  deviceSearch: presenceSearch,
  settingsSearch: [
    'Discover configured Shelly sensors',
    'Sensor address',
    'Local access password',
    'Connect configured sensor',
    'Custom HTTPS certificates',
    'Trusted CA certificate',
    'Client certificate',
    'Client private key',
    'Connected sensors',
    'Forget sensor',
  ].map((title) => ({
    id: title,
    title,
    focus: title,
    keywords: ['Shelly', 'Presence', 'connect', title],
  })),
  settings: () => <EnrollmentSettings />,
};
