import { PLUGIN_UI_ROW, type PluginUiRow } from '@smarteverything/domain';

const FIXTURE_PLUGIN = 'garden';

export function uiRowFixture(extra: Readonly<Record<string, unknown>> = {}): PluginUiRow {
  return PLUGIN_UI_ROW.parse({
    id: FIXTURE_PLUGIN,
    name: 'Garden',
    icon_url: null,
    tools_off: [],
    widgets: [
      {
        id: 'soil',
        title: 'Soil',
        icon: 'droplet',
        sizes: ['W', 'XL'],
        body: { type: 'figure', value: { stream: 'soil', field: 'wetness' }, caption: 'Wetness' },
      },
      {
        id: 'garden-rain',
        title: 'Rain',
        icon: 'no-such-icon',
        sizes: ['M'],
        body: { type: 'sparkline', value: { stream: 'rain' }, minutes: 60 },
      },
    ],
    pages: [
      {
        id: 'overview',
        title: 'Garden overview',
        icon: 'droplet',
        sections: [
          {
            title: 'Soil now',
            body: { type: 'gauge', value: { stream: 'soil' }, min: 0, max: 100 },
          },
          { title: 'Wet spots', body: { type: 'list', value: { stream: 'spots' }, limit: 3 } },
        ],
      },
    ],
    ...extra,
  });
}
