import type { AppPlugin } from '../contract';
import { BeltNotices } from './components/belt-notices';
import { TreadmillCardFace, TreadmillTile } from './components/treadmill-card';
import { isTreadmill } from './data/use-treadmill-device';
import { TreadmillHero } from './hero';
import { SETTING_ROWS } from './model/search-rows';
import { TreadmillOverview } from './overview';
import { TreadmillQuick } from './quick';
import { TREADMILL_PAGE, treadmillSearch } from './search';
import { SessionsSection } from './sections/sessions-section';
import { StatsSection } from './sections/stats-section';
import { TreadmillSettingsPage } from './settings/settings-page';
import { TREADMILL_WIDGETS } from './widgets';

const TREADMILL_PLUGIN = 'treadmill';

export const treadmillAppPlugin: AppPlugin = {
  id: TREADMILL_PLUGIN,
  widgets: TREADMILL_WIDGETS,
  home: (devices) =>
    devices.some(isTreadmill) ? TREADMILL_WIDGETS.map((widget) => widget.type) : [],
  deviceCards: [
    {
      key: 'treadmill',
      applies: isTreadmill,
      render: (device, size, showRoom) => (
        <TreadmillTile device={device} showRoom={showRoom} compact={size === 'tile'} />
      ),
      cell: (device, frame, size) => (
        <TreadmillCardFace device={device} frame={frame} size={size} />
      ),
      quick: (device) => <TreadmillQuick device={device} />,
      hero: (device) => <TreadmillHero device={device} />,
      notice: (device) => <BeltNotices deviceId={device.id} />,
    },
  ],
  deviceOverviews: [
    {
      key: 'treadmill',
      replacesReadings: true,
      applies: isTreadmill,
      render: (device) => <TreadmillOverview device={device} />,
    },
  ],
  deviceSections: [
    {
      key: 'stats',
      order: 1,
      icon: 'trendUp',
      title: 'Stats',
      applies: isTreadmill,
      render: (device) => <StatsSection device={device} />,
    },
    {
      key: 'sessions',
      order: 2,
      icon: 'route',
      title: 'Sessions',
      applies: isTreadmill,
      render: (device) => <SessionsSection device={device} />,
    },
  ],
  deviceSettings: [],
  devicePages: {
    pages: [
      {
        id: TREADMILL_PAGE,
        title: 'Treadmill',
        subtitle: 'Link, safety, belt settings, goals and care',
        icon: 'footprints',
        keywords: ['treadmill', 'walking pad', 'walkingpad', 'KS Fit', 'belt', 'Kingsmith'],
        settings: SETTING_ROWS.map((row) => row.title),
        applies: isTreadmill,
        render: (device) => <TreadmillSettingsPage device={device} />,
      },
    ],
    search: treadmillSearch,
  },
  settings: null,
};
