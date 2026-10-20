import type { AppPlugin } from '../contract';
import { BottleCardFace, BottleQuick, BottleTile } from './components/bottle-card';
import { BindingNotice } from './components/notice-card';
import { isBottle } from './data/use-bottle-device';
import { bottleOfPerson } from './model/bottle-model';
import { useBottleStatus } from './data/bottle-data';
import { BottleHero } from './hero';
import { SETTING_ROWS } from './model/search-rows';
import { BottleOverview } from './overview';
import { BOTTLE_PAGE, bottleSearch } from './search';
import { CareSection } from './sections/care-section';
import { SessionsSection } from './sections/sessions-section';
import { StatsSection } from './sections/stats-section';
import { BottleSettingsPage } from './settings/settings-page';
import { LARQ_WIDGETS } from './widgets';
import type { Device } from '../../store/state';
import type { ReactNode } from 'react';

const LARQ_PLUGIN = 'larq';

function Notice({ device }: { readonly device: Device }): ReactNode {
  const view = useBottleStatus(device.id).data;
  return view === undefined ? null : <BindingNotice view={view} />;
}

export const larqAppPlugin: AppPlugin = {
  id: LARQ_PLUGIN,
  widgets: LARQ_WIDGETS,
  home: (devices, profileId) =>
    bottleOfPerson(devices.filter(isBottle), profileId) === null
      ? []
      : LARQ_WIDGETS.map((widget) => widget.type),
  deviceCards: [
    {
      key: 'larq',
      applies: isBottle,
      render: (device, size, showRoom) => (
        <BottleTile device={device} showRoom={showRoom} compact={size === 'tile'} />
      ),
      cell: (device, frame, size) => <BottleCardFace device={device} frame={frame} size={size} />,
      quick: (device) => <BottleQuick device={device} />,
      hero: (device) => <BottleHero device={device} />,
      notice: (device) => <Notice device={device} />,
    },
  ],
  deviceOverviews: [
    {
      key: 'larq',
      replacesReadings: true,
      applies: isBottle,
      render: (device) => <BottleOverview device={device} />,
    },
  ],
  deviceSections: [
    {
      key: 'stats',
      order: 1,
      icon: 'trendUp',
      title: 'Stats',
      applies: isBottle,
      render: (device) => <StatsSection device={device} />,
    },
    {
      key: 'sessions',
      order: 2,
      icon: 'glassWater',
      title: 'Fills',
      applies: isBottle,
      render: (device) => <SessionsSection device={device} />,
    },
    {
      key: 'care',
      order: 3,
      icon: 'sparkles',
      title: 'Care',
      applies: isBottle,
      render: (device) => <CareSection device={device} />,
    },
  ],
  deviceSettings: [],
  devicePages: {
    pages: [
      {
        id: BOTTLE_PAGE,
        title: 'Water bottle',
        subtitle: 'Whose drinks, reminders, quiet hours, filter and calibration',
        icon: 'glassWater',
        keywords: ['bottle', 'water bottle', 'LARQ', 'PureVis', 'hydration', 'UV'],
        settings: SETTING_ROWS.map((row) => row.title),
        applies: isBottle,
        render: (device) => <BottleSettingsPage device={device} />,
      },
    ],
    search: bottleSearch,
  },
  settings: null,
};
