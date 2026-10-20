import { PRINTER_ACTION_TOOL_INPUT, PRINTER_READ_INPUT, PrinterError } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { failure, type HubToolResult } from '../../../ai-tools/hub-tool';
import type { PluginTool } from '../contract';
import { definePluginTool } from '../define';
import { READ_HINTS, WRITE_HINTS, toolResult } from '../tool-kit';
import type { PrinterService } from './service';

function failed(cause: unknown): HubToolResult {
  if (cause instanceof PrinterError)
    return failure(cause.message, { reason: cause.reason, ...cause.fields });
  return failure(messageOf(cause));
}

export function printerTools(service: Pick<PrinterService, 'read' | 'act'>): PluginTool[] {
  return [
    definePluginTool({
      name: 'printer',
      title: 'Printers',
      description:
        'Read network printers. view = overview (state, supplies, queue count, today), supplies (levels, days left, history), trays (paper and output bins), queue (active and waiting jobs), jobs (history with state, from, to, person, limit), stats (period day, week, month or year with anchor and comparison, metric names the figure), options (what this printer can do and the print settings), candidates (printers found on the network), settings (owner). Omit printer when only one is set up. Members see only their own job names.',
      input: PRINTER_READ_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: (input, caller) => {
        try {
          return Promise.resolve(toolResult(service.read(input, caller)));
        } catch (cause) {
          return Promise.resolve(failed(cause));
        }
      },
    }),
    definePluginTool({
      name: 'printer_action',
      title: 'Printer actions',
      description:
        'Act on a network printer. action = print (source upload, attachment or machine file; PDF, JPEG, PNG or WebP; options such as copies, sides, colorMode), test_page, cancel and hold and release (job key), cancel_all (owner), identify (beep or flash), pause and resume, open_page, configure (settings and own print defaults), add (owner: uri, the first call of an ipps printer returns its certificate to confirm by repeating the call with fingerprint), rescan, trust_certificate (fingerprint), credentials, clear_history and forget (owner). The options view lists the actions this printer allows.',
      input: PRINTER_ACTION_TOOL_INPUT,
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: async (input, caller) => {
        try {
          return toolResult(await service.act(input, caller));
        } catch (cause) {
          return failed(cause);
        }
      },
    }),
  ];
}
