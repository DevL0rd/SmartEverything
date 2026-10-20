import { z } from 'zod';
import type { PluginManifestInput } from '@smarteverything/domain';
import { defineBuiltinPlugin } from '../define';
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
    events: [
      {
        kind: 'job_started',
        title: 'A print job started',
        fields: { pages: 'number', person: 'string', printer: 'string', printer_id: 'string' },
      },
      {
        kind: 'job_finished',
        title: 'A print job ended',
        fields: {
          result: 'string',
          pages: 'number',
          person: 'string',
          printer: 'string',
          printer_id: 'string',
        },
      },
      {
        kind: 'problem_added',
        title: 'A printer problem began',
        fields: {
          keyword: 'string',
          severity: 'string',
          part: 'string',
          printer: 'string',
          printer_id: 'string',
        },
      },
      {
        kind: 'problem_cleared',
        title: 'A printer problem ended',
        fields: { keyword: 'string', part: 'string', printer: 'string', printer_id: 'string' },
      },
      {
        kind: 'alert',
        title: 'A printer raised an alert',
        fields: {
          code: 'string',
          group: 'string',
          severity: 'string',
          printer: 'string',
          printer_id: 'string',
        },
      },
      {
        kind: 'supply_low',
        title: 'Ink or toner is low',
        fields: {
          supply: 'string',
          key: 'string',
          level: 'number',
          printer: 'string',
          printer_id: 'string',
        },
      },
      {
        kind: 'supply_empty',
        title: 'Ink or toner ran out',
        fields: {
          supply: 'string',
          key: 'string',
          level: 'number',
          printer: 'string',
          printer_id: 'string',
        },
      },
      {
        kind: 'supply_replaced',
        title: 'A cartridge was replaced',
        fields: {
          supply: 'string',
          key: 'string',
          level: 'number',
          certain: 'boolean',
          printer: 'string',
          printer_id: 'string',
        },
      },
      {
        kind: 'restarted',
        title: 'A printer restarted',
        fields: { printer: 'string', printer_id: 'string' },
      },
      {
        kind: 'config_changed',
        title: 'A printer changed its settings',
        fields: { printer: 'string', printer_id: 'string' },
      },
      {
        kind: 'pairing_problem',
        title: 'A printer connection needs attention',
        fields: { reason: 'string', printer: 'string', printer_id: 'string' },
      },
      {
        kind: 'offline_long',
        title: 'A printer has been offline for 30 minutes',
        fields: { printer: 'string', printer_id: 'string' },
      },
    ],
  },
};

export const printerPlugin = defineBuiltinPlugin({
  manifest: PRINTER_MANIFEST,
  settings: z.strictObject({}),
  start: (ctx) => new PrinterRuntime(ctx).start(),
});
