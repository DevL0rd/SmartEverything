import { z } from 'zod';
import type { PluginManifestInput } from '@smarteverything/domain';
import { entryFromSpec } from '../../../models/contributions';
import { defineBuiltinPlugin } from '../define';
import { PRINTER_AUTOMATION } from './automation';
import { PRINTER_EVENTS } from './events';
import { PRINTER_MODEL_MATCH, PRINTER_MODELS } from './models';
import { PrinterRuntime } from './runtime';

const PRINTER_MANIFEST: PluginManifestInput = {
  id: 'printer',
  name: 'Printers',
  version: '1.0.0',
  publisher: 'SmartEverything',
  icon: 'printer',
  description:
    'Network printers over IPP and IPP Everywhere: ink and toner, paper, the print queue, printing and cancelling, history and statistics.',
  contributes: {
    deviceFamilies: ['printer'],
    search: 'push',
    events: [...PRINTER_EVENTS],
    automation: PRINTER_AUTOMATION,
  },
};

export const printerPlugin = defineBuiltinPlugin({
  manifest: PRINTER_MANIFEST,
  models: PRINTER_MODELS.map((spec) =>
    entryFromSpec(spec, { match: PRINTER_MODEL_MATCH, brands: ['Brother'] }),
  ),
  settings: z.strictObject({}),
  start: (ctx) => new PrinterRuntime(ctx).start(),
});
