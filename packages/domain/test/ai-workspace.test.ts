import { describe, expect, it } from 'vitest';
import {
  AI_SESSION_INFO,
  AI_WORKSPACE,
  API_ENDPOINTS,
  DELIVERABLES_PRESENTED_DATA,
  WORKSPACE_CHANGES_RECORD_DATA,
  WORKSPACE_STATE_RECORD_DATA,
} from '../src';

const DIFF = {
  kind: 'text',
  path: 'a.ts',
  display: 'a.ts',
  before: true,
  after: true,
  hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }],
  coarse: false,
} as const;

const RECORD = {
  seq: 7,
  turn: 2,
  cwd: '/work',
  files: [{ path: 'a.ts', display: 'a.ts', added: 1, deleted: 1, diff: DIFF }],
  total: 1,
  added: 1,
  deleted: 1,
} as const;

describe('the workspace records in the session log', () => {
  it('accept a changed-files record with its comparison', () => {
    expect(WORKSPACE_CHANGES_RECORD_DATA.parse(RECORD)).toStrictEqual(RECORD);
  });

  it('refuse a record with a field the contract does not name', () => {
    expect(WORKSPACE_CHANGES_RECORD_DATA.safeParse({ ...RECORD, extra: 1 }).success).toBe(false);
    expect(WORKSPACE_STATE_RECORD_DATA.safeParse({ git: 'maybe' }).success).toBe(false);
  });

  it('accept a declaration with and without a description and refuse a missing call id', () => {
    const files = [{ path: '/a.docx', description: 'Draft' }, { path: '/b.xlsx' }];

    expect(DELIVERABLES_PRESENTED_DATA.parse({ turn: 1, callId: 'p1', files }).files).toHaveLength(
      2,
    );
    expect(DELIVERABLES_PRESENTED_DATA.safeParse({ turn: 1, files }).success).toBe(false);
  });
});

describe('the workspace and session figures endpoints', () => {
  it('read both through the chat, for members', () => {
    expect(API_ENDPOINTS.readAiChatWorkspace).toMatchObject({
      method: 'GET',
      path: '/api/ai/chats/:chatId/harness/workspace',
      access: 'member',
    });
    expect(API_ENDPOINTS.readAiChatSessionInfo).toMatchObject({
      method: 'GET',
      path: '/api/ai/chats/:chatId/harness/session-info',
      access: 'member',
    });
  });

  it('answer the empty states', () => {
    expect(AI_WORKSPACE.parse({ git: 'unknown', turns: [], deliverables: [] }).turns).toStrictEqual(
      [],
    );
    expect(
      AI_SESSION_INFO.safeParse({
        stats: {
          turns: 0,
          steps: 0,
          llm_ms: 0,
          tool_ms: 0,
          ttft_ms: 0,
          ttft_steps: 0,
          decode_ms: 0,
          decode_tokens: 0,
        },
        turns: [],
      }).success,
    ).toBe(true);
  });
});
