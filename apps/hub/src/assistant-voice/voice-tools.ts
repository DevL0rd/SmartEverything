import type { HubTool, ToolSpec } from '../ai-tools/hub-tool';
import { chatSet } from '../ai-tools/tool-sets';
import { SIGHT_SOURCES } from '@smarteverything/domain';
import type { HostedSpeaking } from './outreach';
import { VOICE_DEFERRED_TOOLS } from './voice-deferred';
import { voiceSpecOf } from './voice-shapes';

export const WEB_SEARCH_TOOL = 'web_search';

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
    'Do something bigger than the home tools: computer work, messages, files, code, research, looking things up online. It runs in the background while you keep talking; the result comes back as a [Task update] note.',
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
    'Look with your own eyes to answer them: one still picture, taken now. With no source you look at the screen of the device the call comes from. Sources: phone_camera, phone_screen, desktop_screen, desktop_window (by application name or title), home_camera (by name or id). Looking on your own (asked false) may ask them first.',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: SIGHT_SOURCES,
        description: 'What to look at; the calling device screen when left out',
      },
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
        description:
          'True when they asked you to look or asked about it; false when you look on your own',
      },
    },
    required: ['why', 'asked'],
  },
};

const STOP_LOOKING: ToolSpec = {
  name: VOICE_TOOL_NAMES.stopLooking,
  description: 'Stop looking at what they show you (camera, screen or window); the call goes on.',
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
    ...chatSet(withoutChatOnly(enabled, sight))
      .filter((tool) => !VOICE_DEFERRED_TOOLS.has(tool.name))
      .map(voiceSpecOf),
    ...(responder ? [DO_TASK] : []),
    ...(sight ? [SEE, STOP_LOOKING] : []),
    END,
  ].sort((a, b) => a.name.localeCompare(b.name));
}

export function hostedSet<T extends ToolSpec>(
  set: readonly T[],
  speaking: HostedSpeaking | null,
): T[] {
  if (speaking === null) {
    return [...set];
  }
  return set.filter((tool) => !speaking.hiddenTools.has(tool.name));
}
