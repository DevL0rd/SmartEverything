import { describe, expect, it, vi } from 'vitest';
import type { AssistantMessageRow, ChatTimelineTool } from '@smarteverything/domain';

vi.mock('../data/chat-store', () => ({ useChatMessages: (): readonly never[] => [] }));

const { chatTools } = await import('./chat-tools');
const { currentTodo, latestTodos, savedTodos } = await import('./todo-model');
const { backgroundCommands, runningJobs } = await import('../jobs/jobs-model');

function call(
  callId: string,
  input: unknown,
  state: ChatTimelineTool['state'] = 'done',
): ChatTimelineTool {
  return {
    callId,
    name: 'todo_write',
    title: 'Todo write',
    state,
    detail: null,
    input: JSON.stringify(input),
    output: null,
    redacted: false,
    image_operation_id: null,
  };
}

function list(status: 'pending' | 'in_progress' | 'completed'): unknown {
  return {
    todos: [
      { content: 'Read the code', status: 'completed' },
      { content: 'Write the fix', status },
    ],
  };
}

function reply(id: string, at: string, tool: ChatTimelineTool): AssistantMessageRow {
  return {
    id,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role: 'responder',
    kind: 'text',
    author: 'Coordinator',
    text: '',
    attachments: [],
    state: 'answered',
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: null,
    chat_id: '00000000-0000-4000-8000-000000000003',
    origin: { source: 'app', plugin_id: null, device_id: null, name: 'Me' },
    embeds: [
      { kind: 'chat_timeline', version: 1, parts: [{ kind: 'tool', key: tool.callId, tool }] },
    ],
    cost_micros: 0,
    model: null,
    created_at: at,
    updated_at: at,
  };
}

describe('latestTodos', () => {
  it('uses the newest accepted list and counts finished tasks', () => {
    const todos = latestTodos([call('a', list('pending')), call('b', list('completed'))]);
    expect(todos?.done).toBe(2);
    expect(todos?.items.map((item) => item.status)).toEqual(['completed', 'completed']);
  });

  it('skips a refused or running update so the shown list stays the saved one', () => {
    const todos = latestTodos([
      call('a', list('in_progress')),
      call('b', list('completed'), 'failed'),
      call('c', list('completed'), 'running'),
    ]);
    expect(todos?.items[1]?.status).toBe('in_progress');
  });

  it('shows nothing when the AI never wrote a list', () => {
    expect(latestTodos([{ ...call('a', list('pending')), name: 'read' }])).toBeNull();
    expect(latestTodos([call('a', { todos: 'none' })])).toBeNull();
  });

  it('shows no list rather than an older one when the newest call lost its input', () => {
    expect(
      latestTodos([
        call('a', list('in_progress')),
        { ...call('b', list('completed')), input: null },
      ]),
    ).toBeNull();
  });
});

describe('savedTodos', () => {
  it('reads the newest saved checklist and counts finished tasks', () => {
    const saved = savedTodos([
      {
        created_at: '2026-11-06T02:54:50.395Z',
        embeds: [
          {
            kind: 'chat_todos',
            version: 1,
            items: [
              { content: 'Build the page', status: 'in_progress' },
              { content: 'Verify it', status: 'pending' },
            ],
          },
        ],
      },
      {
        created_at: '2026-11-06T02:58:40.937Z',
        embeds: [
          { kind: 'chat_timeline', version: 1, parts: [] },
          {
            kind: 'chat_todos',
            version: 1,
            items: [
              { content: 'Build the page', status: 'completed' },
              { content: 'Verify it', status: 'completed' },
            ],
          },
        ],
      },
    ]);
    expect(saved?.done).toBe(2);
    expect(saved?.items.map((item) => item.status)).toEqual(['completed', 'completed']);
  });

  it('shows nothing when no reply saved a checklist', () => {
    expect(savedTodos([{ created_at: '2026-11-06T02:54:50.395Z', embeds: [] }])).toBeNull();
  });
});

describe('chatTools', () => {
  it('orders tool calls by the time their message was made', () => {
    const tools = chatTools([
      reply(
        '00000000-0000-4000-8000-000000000012',
        '2026-10-25T10:00:01.000Z',
        call('late', list('pending')),
      ),
      reply(
        '00000000-0000-4000-8000-000000000011',
        '2026-10-25T10:00:00.000Z',
        call('early', list('pending')),
      ),
    ]);
    expect(tools.map((tool) => tool.callId)).toEqual(['early', 'late']);
  });
});

describe('a stored dsh chat', () => {
  const stored: ChatTimelineTool = {
    ...call('call_68ef6095d5bd458884cfd66b', {
      todos: [
        { content: 'check A', status: 'completed' },
        { content: 'check B', status: 'in_progress' },
        { content: 'check C', status: 'pending' },
      ],
    }),
    detail: 'Updated todo list: 1 pending, 1 in progress, 1 completed.',
  };
  const job: ChatTimelineTool = {
    ...call('call_b86214aec7564852aee56189', {
      description: 'Start 20s ticker background job',
      command: 'for i in $(seq 1 10); do sleep 2; done',
      run_in_background: true,
    }),
    name: 'bash',
    detail: 'started background job bash-4baada7e099b4efe',
  };

  it('gives the task strip and the jobs card their data from the saved reply', () => {
    const tools = chatTools([
      reply('00000000-0000-4000-8000-000000000021', '2026-10-25T09:36:45.424Z', stored),
      reply('00000000-0000-4000-8000-000000000022', '2026-10-25T09:36:46.000Z', job),
    ]);
    const todos = latestTodos(tools);
    expect(todos?.done).toBe(1);
    expect(todos === null ? null : currentTodo(todos)).toEqual({
      content: 'check B',
      status: 'in_progress',
    });
    expect(backgroundCommands(tools)).toEqual([
      {
        key: 'call_b86214aec7564852aee56189',
        title: 'Start 20s ticker background job',
        command: 'for i in $(seq 1 10); do sleep 2; done',
        started: true,
      },
    ]);
    expect(
      runningJobs({
        work: [
          { kind: 'turn', id: 'session', reason: 'Native turn is running.' },
          {
            kind: 'shell',
            id: 'bash-4baada7e099b4efe',
            reason: 'A native background process has not stopped.',
          },
        ],
      }),
    ).toEqual({ total: 1, helpers: 0 });
  });

  it('hides the task strip once every task is done', () => {
    const todos = latestTodos([call('a', list('completed'))]);
    expect(todos === null ? undefined : currentTodo(todos)).toBeNull();
  });
});
