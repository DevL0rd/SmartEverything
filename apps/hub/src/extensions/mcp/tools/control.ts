import { AUTOMATION_FILTER, listAutomations } from './automation-list';
import { DEVICE_CONTROL, applyChanges, changeOf } from './changes';
import { COMMANDS, READS, defineTool, type Tool } from './registry';

export const CONTROL_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'device_control',
    input: DEVICE_CONTROL,
    annotations: COMMANDS,
    run: (context, input) => applyChanges(context, [changeOf(input)]),
  }),
  defineTool({
    name: 'automation_read',
    input: AUTOMATION_FILTER,
    annotations: READS,
    run: async (context, input) => ({ structured: await listAutomations(context, input) }),
  }),
];
