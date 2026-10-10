import type { HubTool, ToolSpec } from '../ai-tools/hub-tool';
import { chatSet } from '../ai-tools/tool-sets';
import { SIGHT_SOURCES } from '@smarteverything/domain';
import type { HostedSpeaking } from './outreach';

const CHAT_ONLY_TOOLS: ReadonlySet<string> = new Set(['show_widgets']);

export const VOICE_TOOL_NAMES = {
  task: 'do_task',
  end: 'end_conversation',
  see: 'see',
  stopLooking: 'stop_looking',
} as const;

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

const SEE: ToolSpec = {
  name: VOICE_TOOL_NAMES.see,
  description:
    'Look at something with your own eyes to answer them: one still picture, taken now. Sources: phone_camera (what their phone camera shows), phone_screen, desktop_screen (their computer screen), desktop_window (one application window on their computer, by application name or title), home_camera (a camera of the home, by name or id). Use it when they ask what something is, point at something, or have a question about what is on a screen or in a window. Set asked to true when they asked you to look or asked about it; set it to false when you want to look on your own, and they may be asked first.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', enum: SIGHT_SOURCES, description: 'What to look at' },
      camera: { type: 'string', description: 'home_camera only: the camera’s name or id' },
      facing: { type: 'string', enum: ['front', 'back'], description: 'phone_camera only' },
      screen: {
        type: 'string',
        description: 'desktop_screen only: which screen, if more than one',
      },
      window: {
        type: 'string',
        description: 'desktop_window only: the application name or window title',
      },
      why: { type: 'string', description: 'A few words: what you want to see it for' },
      asked: {
        type: 'boolean',
        description: 'True when they asked you to look or asked a question about it',
      },
    },
    required: ['source', 'why', 'asked'],
  },
};

const STOP_LOOKING: ToolSpec = {
  name: VOICE_TOOL_NAMES.stopLooking,
  description:
    'Stop looking at what they are showing you (camera, screen or window) when you no longer need it or they ask you to. The call goes on.',
  inputSchema: {},
};

export function withoutChatOnly<T extends { readonly name: string }>(
  tools: readonly T[],
  sight: boolean,
): T[] {
  return tools.filter(
    (tool) => !CHAT_ONLY_TOOLS.has(tool.name) && (!sight || tool.name !== VOICE_TOOL_NAMES.see),
  );
}

export function voiceSet(
  enabled: readonly HubTool[],
  responder: boolean,
  sight: boolean,
): ToolSpec[] {
  return [
    ...chatSet(withoutChatOnly(enabled, sight)),
    ...(responder ? [DO_TASK] : []),
    ...(sight ? [SEE, STOP_LOOKING] : []),
    END,
  ];
}

export function hostedSet(set: readonly ToolSpec[], speaking: HostedSpeaking | null): ToolSpec[] {
  if (speaking === null) {
    return [...set];
  }
  return set.filter((tool) => !speaking.hiddenTools.has(tool.name));
}
