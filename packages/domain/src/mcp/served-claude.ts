import type { Served } from './served-types';

export const SERVED_CLAUDE = [
  [
    'read_claude',
    'computers',
    'read',
    'Read Claude',
    'Reads Claude on the computers: the Claude CLI chats SmartEverything started, with their history, prompts and receipts, and the older Claude Desktop and terminal sessions, transcripts and usage.',
    {
      key: 'view',
      parts: {
        status: 'read_claude_status',
        sessions: 'list_claude_sessions',
        session: 'read_claude_session',
        thread: 'read_claude_thread',
        usage: 'read_claude_usage',
        prompts: 'list_claude_prompts',
        cli_sessions: 'list_claude_cli_sessions',
        cli_session: 'read_claude_cli_session',
        cli_history: 'read_claude_cli_history',
        cli_operation: 'read_claude_cli_operation',
        cli_prompts: 'list_claude_cli_prompts',
      },
      says: {
        status: 'Whether Claude is installed and linked on the computer',
        sessions: 'The older Claude Desktop and terminal sessions',
        session: 'One older session with its saved details',
        thread: 'The saved transcript of an older session',
        usage: 'The older usage figures',
        prompts: 'The prompts older sessions are waiting on',
        cli_sessions: 'The Claude CLI chats SmartEverything started on a computer',
        cli_session: 'One of those chats and its saved state',
        cli_history: 'The shared history of one of those chats',
        cli_operation: 'The receipt of one CLI operation',
        cli_prompts: 'The permission, question and plan prompts one of those chats waits on',
      },
    },
  ],
  [
    'edit_claude_session',
    'computers',
    'control',
    'Edit a Claude session',
    'Starts a Claude CLI chat on a computer, sends it a message, stops, resumes or configures it, or answers a permission, question or plan it is waiting on; read the chat first.',
    {
      key: 'action',
      parts: {
        start: 'start_claude_session',
        control: 'control_claude_session',
        answer: 'answer_claude_prompt',
      },
      says: {
        start: 'Start a chat with a model and working directory',
        control: 'Send a message, resume, stop, close or configure a chat',
        answer: 'Answer a waiting permission, question or plan prompt',
      },
    },
  ],
] as const satisfies readonly Served[];
