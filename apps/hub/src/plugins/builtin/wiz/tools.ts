import type { JsonValue } from '@smarteverything/domain';
import type { PluginTool } from '../contract';
import { definePluginTool } from '../define';
import { attemptTool, NO_INPUT, READ_HINTS, toolResult, WRITE_HINTS } from '../tool-kit';

export function wizTools(
  status: () => Readonly<Record<string, JsonValue>>,
  rescan: () => Promise<Readonly<Record<string, JsonValue>>>,
): PluginTool[] {
  return [
    definePluginTool({
      name: 'status',
      title: 'WiZ lights',
      description:
        'List discovered WiZ lights and their local connection status. Read and control each light through the shared device tools.',
      input: NO_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: () => Promise.resolve(toolResult(status())),
    }),
    definePluginTool({
      name: 'rescan',
      title: 'Find WiZ lights',
      description:
        'Run a bounded local network scan for WiZ lights without changing their power or light settings. Local communication must be allowed in WiZ.',
      input: NO_INPUT,
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: () => attemptTool(rescan),
    }),
  ];
}
