import { z } from 'zod';
import {
  CODEX_SESSION,
  CODEX_ITEM,
  type CodexAiRead,
  type CodexAiReply,
} from '@smarteverything/domain';
import { THREAD, THREAD_REPLY, RPC_RECORD } from './protocol';
import type { CodexClient } from './client';
import { CodexRuntimeError } from './errors';
import { readRateLimits } from './rate-limits';
const KNOWN_ITEMS = new Set([
  'userMessage',
  'agentMessage',
  'reasoning',
  'plan',
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'dynamicToolCall',
  'collabAgentToolCall',
  'subAgentActivity',
  'contextCompaction',
  'webSearch',
  'imageView',
  'imageGeneration',
]);

export function nativeSession(raw: unknown, archived = false): z.infer<typeof CODEX_SESSION> {
  const thread = THREAD.parse(raw);
  return CODEX_SESSION.parse({
    id: thread.id,
    title: thread.name,
    cwd: thread.cwd,
    state: sessionState(thread.status),
    archived,
    model: thread.model,
    created_at: new Date(thread.createdAt * 1000).toISOString(),
    updated_at: new Date(thread.updatedAt * 1000).toISOString(),
  });
}
export async function nativeRead(client: CodexClient, request: CodexAiRead): Promise<CodexAiReply> {
  if (request.operation === 'sessions') {
    const page = z
      .object({ data: z.array(THREAD).max(200), nextCursor: z.string().nullable() })
      .parse(
        await client.request('thread/list', {
          limit: request.query.limit,
          archived: request.query.archived,
          ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
        }),
      );
    return {
      operation: 'sessions',
      value: {
        sessions: page.data.map((thread) => nativeSession(thread, request.query.archived)),
        next_cursor: page.nextCursor,
      },
    };
  }
  if (request.operation === 'session')
    return {
      operation: 'session',
      value: nativeSession(
        THREAD_REPLY.parse(
          await client.request('thread/read', {
            threadId: request.session_id,
            includeTurns: false,
          }),
        ).thread,
      ),
    };
  if (request.operation === 'thread') return nativeThread(client, request);
  if (request.operation === 'usage') return nativeUsage(client);
  throw new CodexRuntimeError(
    request.operation,
    'This read is not implemented by the owning Codex connection.',
  );
}

async function nativeThread(
  client: CodexClient,
  request: Extract<CodexAiRead, { operation: 'thread' }>,
): Promise<CodexAiReply> {
  const page = z
    .object({
      data: z.array(z.object({ turnId: z.string(), item: RPC_RECORD })).max(200),
      nextCursor: z.string().nullable(),
    })
    .parse(
      await client.request('thread/items/list', {
        threadId: request.session_id,
        limit: request.query.limit,
        ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
      }),
    );
  return {
    operation: 'thread',
    value: {
      session_id: request.session_id,
      items: page.data.map((entry) => {
        const item = z.object({ id: z.string(), type: z.string() }).parse(entry.item);
        return CODEX_ITEM.parse({
          id: item.id,
          type: item.type,
          turn_id: entry.turnId,
          payload: entry.item,
          unsupported: !KNOWN_ITEMS.has(item.type),
        });
      }),
      next_cursor: page.nextCursor,
      truncated: false,
    },
  };
}

async function nativeUsage(client: CodexClient): Promise<CodexAiReply> {
  const rates = await readRateLimits(client);
  return {
    operation: 'usage',
    value: {
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      rate_limits: rates,
    },
  };
}

function sessionState(status: z.infer<typeof THREAD>['status']): string {
  switch (status.type) {
    case 'notLoaded':
      return 'unknown';
    case 'idle':
      return 'idle';
    case 'systemError':
      return 'failed';
    case 'active':
      if (status.activeFlags?.includes('waitingOnApproval') === true) return 'waiting_approval';
      if (status.activeFlags?.includes('waitingOnUserInput') === true) return 'waiting_answer';
      return 'working';
  }
}
