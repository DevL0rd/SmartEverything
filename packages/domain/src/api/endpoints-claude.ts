import { z } from 'zod';
import {
  CLAUDE_ANSWER,
  CLAUDE_CONTROL,
  CLAUDE_CONTROLLED,
  CLAUDE_CONTROLLER,
  CLAUDE_CONTROLLER_REGISTRATION,
  CLAUDE_LINK,
  CLAUDE_PROMPT,
  CLAUDE_PROMPT_ID,
  CLAUDE_SESSION,
  CLAUDE_SESSION_ID,
  CLAUDE_SESSION_STATE,
  CLAUDE_START,
  CLAUDE_STARTED,
  CLAUDE_STATUS,
  CLAUDE_THREAD_CURSOR,
  CLAUDE_THREAD_LIMIT,
  CLAUDE_THREAD_PAGE,
  CLAUDE_USAGE,
} from '../claude';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING, QUERY_FLAG, queryLimit } from './primitives';

const SESSION_PARAMS = z.strictObject({ sessionId: CLAUDE_SESSION_ID });

const PROMPT_PARAMS = z.strictObject({ promptId: CLAUDE_PROMPT_ID });

const SESSION_LIMIT = 200;

export const CLAUDE_ENDPOINTS = {
  readClaudeStatus: endpoint({
    method: 'GET',
    path: '/api/claude/status',
    access: 'owner',
    summary:
      'Whether the owner’s Claude Desktop (Claude Code) is running and watched, the SmartEverything link and controller state, how many sessions are live, plan usage, and files that could not be read',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: CLAUDE_STATUS,
  }),
  listClaudeSessions: endpoint({
    method: 'GET',
    path: '/api/claude/sessions',
    access: 'owner',
    summary:
      'Claude Desktop (Claude Code) sessions: title, folder, idle, busy or waiting state, model, permission mode and context used; running ones first, then the most recent; archived=true lists the archived ones instead',
    params: NOTHING,
    query: z.strictObject({
      state: CLAUDE_SESSION_STATE.optional(),
      archived: QUERY_FLAG.default(false),
      limit: queryLimit(100, SESSION_LIMIT),
    }),
    body: NO_BODY,
    response: z.array(CLAUDE_SESSION),
  }),
  readClaudeSession: endpoint({
    method: 'GET',
    path: '/api/claude/sessions/:sessionId',
    access: 'owner',
    summary: 'One Claude Desktop (Claude Code) session with what it can and cannot be asked to do',
    params: SESSION_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: CLAUDE_SESSION,
  }),
  listClaudeThread: endpoint({
    method: 'GET',
    path: '/api/claude/sessions/:sessionId/thread',
    access: 'owner',
    summary:
      'The messages of a Claude Desktop (Claude Code) session from its transcript, newest page first: prompts, replies, thinking, tool calls and results; before takes the older cursor of the previous page',
    params: SESSION_PARAMS,
    query: z.strictObject({
      before: CLAUDE_THREAD_CURSOR.optional(),
      limit: queryLimit(50, CLAUDE_THREAD_LIMIT),
    }),
    body: NO_BODY,
    response: CLAUDE_THREAD_PAGE,
  }),
  readClaudeUsage: endpoint({
    method: 'GET',
    path: '/api/claude/usage',
    access: 'owner',
    summary:
      'How much of the Claude plan limits (five hours, seven days) is used, as Claude Desktop last sampled it',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: CLAUDE_USAGE,
  }),
  listClaudePrompts: endpoint({
    method: 'GET',
    path: '/api/claude/prompts',
    access: 'owner',
    summary:
      'Permission requests, questions and plan approvals that Claude sessions are waiting on, oldest first',
    params: NOTHING,
    query: z.strictObject({ sessionId: CLAUDE_SESSION_ID.optional() }),
    body: NO_BODY,
    response: z.array(CLAUDE_PROMPT),
  }),
  controlClaudeSession: endpoint({
    method: 'POST',
    path: '/api/claude/sessions/:sessionId/control',
    access: 'owner',
    summary:
      'Act on a Claude Desktop (Claude Code) session: send a prompt, interrupt the running turn, set its permission mode or set its model; answers 503 claude_not_ready naming what is missing when the SmartEverything link or controller is not ready',
    params: SESSION_PARAMS,
    query: NOTHING,
    body: CLAUDE_CONTROL,
    response: CLAUDE_CONTROLLED,
  }),
  startClaudeSession: endpoint({
    method: 'POST',
    path: '/api/claude/sessions',
    access: 'owner',
    summary:
      'Start a Claude Desktop (Claude Code) session in a folder with a first prompt; through the controller session when it is ready, otherwise Claude Desktop opens its new-session page with the prompt filled in and the person presses Send there',
    params: NOTHING,
    query: NOTHING,
    body: CLAUDE_START,
    response: CLAUDE_STARTED,
  }),
  installClaudeLink: endpoint({
    method: 'POST',
    path: '/api/claude/link',
    access: 'owner',
    summary:
      'Install or repair the SmartEverything link, the plugin that lets Claude Desktop sessions report to SmartEverything and take its answers; replaces the older SmartEverything plugin and retires its old token; the hub already does this at start while Claude Desktop is present unless claude_link_auto is off in the assistant settings; only on the computer that runs Claude Desktop',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: CLAUDE_LINK,
  }),
  removeClaudeLink: endpoint({
    method: 'DELETE',
    path: '/api/claude/link',
    access: 'owner',
    summary: 'Remove the SmartEverything link from Claude Desktop and revoke its access',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: CLAUDE_LINK,
  }),
  registerClaudeController: endpoint({
    method: 'POST',
    path: '/api/claude/controller',
    access: 'owner',
    summary:
      'Begin registering the controller session: returns the folder, the first prompt and a deep link that opens a new Claude Desktop session with it; hand the link to the person, who presses Send once. The session then carries out mode (keep or lower), model, and fallback send and interrupt requests',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: CLAUDE_CONTROLLER_REGISTRATION,
  }),
  removeClaudeController: endpoint({
    method: 'DELETE',
    path: '/api/claude/controller',
    access: 'owner',
    summary: 'Forget the controller session; it stops receiving requests',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: CLAUDE_CONTROLLER,
  }),
  answerClaudePrompt: endpoint({
    method: 'POST',
    path: '/api/claude/prompts/:promptId/answer',
    access: 'owner',
    summary:
      'Answer a waiting Claude prompt: allow or deny a permission request or plan, or pick the answers to its questions',
    params: PROMPT_PARAMS,
    query: NOTHING,
    body: CLAUDE_ANSWER,
    response: CLAUDE_PROMPT,
  }),
} as const;
