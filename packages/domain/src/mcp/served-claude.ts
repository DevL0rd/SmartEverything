import type { Served } from './served-types';

export const SERVED_CLAUDE = [
  [
    'read_claude_cli',
    'computers',
    'read',
    'Read owned Claude CLI sessions',
    'List owned managed CLI chats or read exact saved native state, canonical shared history or durable operation receipt on the selected computer, without starting a process. Stopped chats remain readable; the authenticated current owner profile is fixed.',
    {
      key: 'view',
      parts: {
        sessions: 'list_claude_cli_sessions',
        session: 'read_claude_cli_session',
        history: 'read_claude_cli_history',
        operation: 'read_claude_cli_operation',
        prompts: 'list_claude_cli_prompts',
      },
    },
  ],
] as const satisfies readonly Served[];
