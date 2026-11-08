import type { PluginManifestInput } from '@smarteverything/domain';
import { entryFromSpec } from '../../../models/contributions';
import { figureWidget } from '../board-widget';
import { defineBuiltinPlugin } from '../define';
import { ADGUARD_AUTOMATION, PROTECTION_CHANGED } from './automation';
import { ADGUARD_MODEL_MATCH, ADGUARD_MODELS } from './models';
import { SNAPSHOT_STREAM, startAdGuard } from './runtime';
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
    events: [PROTECTION_CHANGED],
    widgets: [figureWidget('adguard-blocking', 'Ad blocking', 'shield', SNAPSHOT_STREAM)],
    settings: ADGUARD_SETTINGS_FORM,
    search: 'push',
    deviceFamilies: ['dns_filter'],
    automation: ADGUARD_AUTOMATION,
  },
};

export const adguardPlugin = defineBuiltinPlugin({
  manifest: ADGUARD_MANIFEST,
  models: ADGUARD_MODELS.map((spec) =>
    entryFromSpec(spec, { match: ADGUARD_MODEL_MATCH, brands: ['AdGuard'] }),
  ),
  settings: ADGUARD_SETTINGS,
  start: (ctx) => Promise.resolve(startAdGuard(ctx)),
});
