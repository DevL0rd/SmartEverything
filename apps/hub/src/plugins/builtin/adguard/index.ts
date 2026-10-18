import type { PluginManifestInput } from '@smarteverything/domain';
import { figureWidget } from '../board-widget';
import { defineBuiltinPlugin } from '../define';
import { PROTECTION_CHANGED_EVENT, SNAPSHOT_STREAM, startAdGuard } from './runtime';
import { ADGUARD_SETTINGS, ADGUARD_SETTINGS_FORM } from './settings';

const ADGUARD_MANIFEST: PluginManifestInput = {
  id: 'adguard',
  name: 'AdGuard Home',
  version: '1.0.0',
  description:
    'Network-wide ad blocking with AdGuard Home: protection, blocked lookups, the query log and filter lists.',
  publisher: 'SmartEverything',
  icon: 'shield',
  contributes: {
    data: [
      {
        stream: SNAPSHOT_STREAM,
        title: 'AdGuard Home',
        schema: { type: 'object' },
        history: 0,
        live: true,
      },
    ],
    events: [
      {
        kind: PROTECTION_CHANGED_EVENT,
        title: 'Ad blocking turned on or off',
        fields: { enabled: 'boolean', until: 'string' },
      },
    ],
    widgets: [figureWidget('adguard-blocking', 'Ad blocking', 'shield', SNAPSHOT_STREAM)],
    settings: ADGUARD_SETTINGS_FORM,
    search: 'push',
    deviceFamilies: ['dns_filter'],
  },
};

export const adguardPlugin = defineBuiltinPlugin({
  manifest: ADGUARD_MANIFEST,
  settings: ADGUARD_SETTINGS,
  start: (ctx) => Promise.resolve(startAdGuard(ctx)),
});
