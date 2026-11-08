import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@smarteverything/domain';
import type { AiUsageRow } from '@smarteverything/domain';
import { auxAccountingFetch } from '../../src/assistant/aux-accounting';
import { AuxCompletionBinding, auxCompletionsOf } from '../../src/assistant/aux-completion-binding';
import { bindMeteredBudget } from '../../src/harness/metered-accounting';
import { testStore, type TestStore } from '../support/store';
import { TEST_ENGINE } from '../support/engine';

let opened: TestStore;
let chatId: string;
let profileId: string;
let rows: AiUsageRow[];
let checked: { readonly work: string; readonly profileId: string | undefined }[];
let refusal: ApiError | undefined;

const MODEL = 'google/gemini-3.5-flash-lite';

function frames(): string {
  return [
    { id: 'gen-1', model: MODEL, choices: [{ delta: { content: 'Garden' } }] },
    {
      id: 'gen-1',
      model: MODEL,
      choices: [],
      usage: { prompt_tokens: 40, completion_tokens: 3, cost: 0.000012 },
    },
  ]
    .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
    .concat('data: [DONE]\n\n')
    .join('');
}

function supplier(calls: string[]): typeof fetch {
  return () => {
    calls.push('reached');
    return Promise.resolve(
      new Response(frames(), { headers: { 'content-type': 'text/event-stream' } }),
    );
  };
}

beforeEach(async () => {
  opened = await testStore(() => new Date('2026-10-01T00:00:00.000Z'));
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  profileId = store.profiles.activeOf(client.id).id;
  chatId = store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'New chat',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  }).id;
  rows = [];
  checked = [];
  refusal = undefined;
  store.ledger.on((row) => rows.push(row));
  bindMeteredBudget(store, {
    check: (work, mode): void => {
      checked.push({ work, profileId: mode?.profileId });
      if (refusal !== undefined) throw refusal;
    },
  });
});

afterEach(async () => {
  await opened.close();
});

async function drain(response: Response): Promise<string> {
  return response.text();
}

describe('auxiliary accounting', () => {
  it('records the call on the chat and fills in tokens and cost from the supplier', async () => {
    const calls: string[] = [];
    const fetcher = auxAccountingFetch(opened.store, { chatId, model: MODEL }, supplier(calls));

    await drain(await fetcher('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' }));

    const last = rows.at(-1);
    expect(calls).toEqual(['reached']);
    expect(new Set(rows.map((row) => row.id)).size).toBe(1);
    expect(last).toMatchObject({
      chat_id: chatId,
      profile_id: profileId,
      source: 'openrouter',
      work: 'chat',
      model_id: MODEL,
      generation_id: 'gen-1',
      tokens_in: 40,
      tokens_out: 3,
      cost_micros: 12,
      cost_state: 'reported',
    });
  });

  it('asks the budget as background work for the chat owner before any request', async () => {
    const calls: string[] = [];
    const fetcher = auxAccountingFetch(opened.store, { chatId, model: MODEL }, supplier(calls));

    await drain(await fetcher('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' }));

    expect(checked).toEqual([{ work: 'chat', profileId }]);
  });

  it('refuses a stopped budget without reaching the supplier or recording a row', async () => {
    refusal = new ApiError('conflict', 'Background AI is paused.');
    const calls: string[] = [];
    const fetcher = auxAccountingFetch(opened.store, { chatId, model: MODEL }, supplier(calls));

    await expect(
      fetcher('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(calls).toEqual([]);
    expect(rows).toEqual([]);
  });
});

describe('the auxiliary completion binding', () => {
  it('waits for the runtime before it answers and stops after it is unbound', async () => {
    const binding = auxCompletionsOf(opened.store);
    expect(auxCompletionsOf(opened.store)).toBe(binding);
    const input = { chatId, model: MODEL, system: 's', input: 'i' };

    await expect(binding.complete(input)).rejects.toMatchObject({ code: 'conflict' });

    const unbind = binding.bind({ complete: (request) => Promise.resolve(request.input) });
    await expect(binding.complete(input)).resolves.toBe('i');
    unbind();
    await expect(binding.complete(input)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('keeps one binding per store', () => {
    expect(new AuxCompletionBinding()).not.toBe(auxCompletionsOf(opened.store));
  });
});
