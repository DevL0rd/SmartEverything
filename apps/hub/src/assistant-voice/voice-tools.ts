import type { HubTool, ToolSpec } from '../ai-tools/hub-tool';
import { directSet } from '../ai-tools/tool-sets';
import type { HostedSpeaking } from './outreach';

export const VOICE_TOOL_NAMES = { task: 'do_task', end: 'end_conversation' } as const;

const DO_TASK: ToolSpec = {
  name: VOICE_TOOL_NAMES.task,
  description:
    'Do something bigger than the home tools: computer work, messages, files, code, research, checking or looking things up online. It runs in the background while you keep talking. Results come back to you as [Task update] notes; tell them about it then.',
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description:
          'What to do, in full, with every name, place, detail and preference they gave.',
      },
    },
    required: ['task'],
  },
};

const END: ToolSpec = {
  name: VOICE_TOOL_NAMES.end,
  description: 'End this conversation.',
  inputSchema: {},
};

export function voiceSet(enabled: readonly HubTool[], responder: boolean): ToolSpec[] {
  return [...directSet(enabled), ...(responder ? [DO_TASK] : []), END];
}

export function hostedSet(set: readonly ToolSpec[], speaking: HostedSpeaking | null): ToolSpec[] {
  if (speaking === null) {
    return [...set];
  }
  return set.filter((tool) => !speaking.hiddenTools.has(tool.name));
}
