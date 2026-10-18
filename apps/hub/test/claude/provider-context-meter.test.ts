import { afterEach, describe, expect, it } from 'vitest';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { PROVIDER_TURN, type ProviderEvent } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { contextPercent } from '../../src/claude/provider/context-percent';
import { JobLog } from '../../src/claude/provider/job-log';
import { contextPercentOf } from '../../src/assistant/engines/computer/context-meter';
import { captureLogs, testLogger } from '../support/logs';

const JOB = '6b6e4f0e-2d6c-4f54-9d3a-0a4a4f5c7d11';
const CHAT = '0f9a8c1e-7a3b-4d77-8d5e-3b0f6f7a2c10';

afterEach(() => {
  Logger.reset();
});

const TURN = PROVIDER_TURN.parse({
  job_id: JOB,
  device_id: '3c1d5a52-9a0e-4b0d-8f0b-7f2b1f6d4e90',
  chat_id: CHAT,
  profile_id: 'a2c8d0aa-52a4-4c87-8c33-0c6e5e3d9b21',
  model: 'sonnet',
  effort: null,
  session_id: null,
  system: 'system',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  tools: [],
  options: { builtin_tools: [] },
});

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- partial fake of the SDK query
function loose<T>(value: object): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- same partial fake
  return Object.assign(Object.create(null), value);
}

function jobLog(): JobLog {
  return new JobLog(
    testLogger('claude'),
    () => TURN,
    () => 'session',
  );
}

describe('Claude context meter', () => {
  it('reads the summary percentage of the finished turn', async () => {
    const details: unknown[] = [];
    const query = loose<Query>({
      getContextUsage: (options: unknown): Promise<{ percentage: number }> => {
        details.push(options);
        return Promise.resolve({ percentage: 37.4 });
      },
    });
    expect(await contextPercent(query, jobLog())).toBe(37.4);
    expect(details).toEqual([{ detail: 'summary' }]);
  });

  it('keeps the percentage inside 0 to 100', async () => {
    const query = loose<Query>({ getContextUsage: () => Promise.resolve({ percentage: 140 }) });
    expect(await contextPercent(query, jobLog())).toBe(100);
  });

  it('reports an unreadable meter as unknown and logs it', async () => {
    const logs = captureLogs();
    const query = loose<Query>({ getContextUsage: () => Promise.reject(new Error('closed')) });
    expect(await contextPercent(query, jobLog())).toBeNull();
    expect(logs.events()).toContain('claude.context_unreadable');
  });

  it('rounds the reported percentage for the chat and ignores an unknown one', () => {
    const usage: ProviderEvent = {
      kind: 'usage',
      input_tokens: 1,
      output_tokens: 1,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost_usd: null,
      context_percent: 41.6,
      job_id: JOB,
      chat_id: CHAT,
      seq: 1,
    };
    expect(contextPercentOf(usage)).toBe(42);
    expect(contextPercentOf({ ...usage, context_percent: null })).toBeNull();
    expect(
      contextPercentOf({
        kind: 'completed',
        session_id: 's',
        interrupted: false,
        job_id: JOB,
        chat_id: CHAT,
        seq: 2,
      }),
    ).toBeNull();
  });
});
