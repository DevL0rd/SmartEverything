import type { AppPlugin } from '../contract';
import { BrushCardFace, BrushTile } from './components/brush-card';
import { BrushNotices } from './components/brush-notices';
import { BRAND_UI } from './brands';
import { isToothbrush } from './data/use-brush-device';
import { ALL_SEARCH_ROWS } from './model/search-index';
import { BRUSH_WORDS } from './model/search-rows';
import { BrushHero } from './hero';
import { BrushOverview } from './overview';
import { BrushQuick } from './quick';
import { BRUSH_PAGE, brushSearch } from './search';
import { CareSection } from './sections/care-section';
import { SessionsSection } from './sections/sessions-section';
import { StatsSection } from './sections/stats-section';
import { BrushSettingsPage } from './settings/settings-page';
import { BRUSH_WIDGETS } from './widgets';

const BRUSH_PLUGIN = 'toothbrush';

export const toothbrushAppPlugin: AppPlugin = {
  id: BRUSH_PLUGIN,
  widgets: BRUSH_WIDGETS,
  home: (devices) => (devices.some(isToothbrush) ? BRUSH_WIDGETS.map((widget) => widget.type) : []),
  deviceCards: [
    {
      key: 'toothbrush',
      applies: isToothbrush,
      render: (device, size, showRoom) => (
        <BrushTile device={device} showRoom={showRoom} compact={size === 'tile'} />
      ),
      cell: (device, frame, size) => <BrushCardFace device={device} frame={frame} size={size} />,
      quick: (device) => <BrushQuick device={device} />,
      hero: (device) => <BrushHero device={device} />,
      notice: (device) => <BrushNotices deviceId={device.id} />,
    },
  ],
  deviceOverviews: [
    {
      key: 'toothbrush',
      replacesReadings: true,
      applies: isToothbrush,
      render: (device) => <BrushOverview device={device} />,
    },
  ],
  deviceSections: [
    {
      key: 'stats',
      order: 1,
      icon: 'trendUp',
      title: 'Stats',
      applies: isToothbrush,
      render: (device) => <StatsSection device={device} />,
    },
    {
      key: 'sessions',
      order: 2,
      icon: 'timer',
      title: 'Sessions',
      applies: isToothbrush,
      render: (device) => <SessionsSection device={device} />,
    },
    {
      key: 'care',
      order: 3,
      icon: 'toothbrush',
      title: 'Care',
      applies: isToothbrush,
      render: (device) => <CareSection device={device} />,
    },
  ],
  deviceSettings: [],
  devicePages: {
    pages: [
      {
        id: BRUSH_PAGE,
        title: 'Toothbrush',
        subtitle: 'Link, goals, alerts, sensors and care',
        icon: 'toothbrush',
        keywords: [...BRUSH_WORDS, ...BRAND_UI.sonicare.keywords, ...BRAND_UI.oralb.keywords],
        settings: ALL_SEARCH_ROWS.map((row) => row.title),
        applies: isToothbrush,
        render: (device) => <BrushSettingsPage device={device} />,
      },
    ],
    search: brushSearch,
  },
  settings: null,
};
