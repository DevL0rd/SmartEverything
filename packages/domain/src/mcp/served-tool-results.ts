import type { Served } from './served-types';

export const SERVED_TOOL_RESULTS = [
  [
    'read_tool_result',
    'assistant',
    'read',
    'Read a full tool result',
    'The complete output (or input) of one tool call in a chat, a page of characters at a time: chatId from your context, callId from the tool call, offset and limit in characters, field output or input. next_offset continues the page. A clipped result in the timeline says how long the full text is.',
    { part: 'read_tool_result' },
  ],
] as const satisfies readonly Served[];
