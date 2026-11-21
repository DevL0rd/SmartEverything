import { AI_USAGE_ROW, type LiveWireChange } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityStore } from './entity-store';

const USAGE_ID = 'a1b2c3d4-0000-4000-8000-000000000004';

const usage = AI_USAGE_ROW.parse({
  id: USAGE_ID,
  at: '2026-10-25T11:00:00.000Z',
  profile_id: 'a1b2c3d4-0000-4000-8000-000000000003',
  client_id: null,
  chat_id: null,
  message_id: null,
  call_id: null,
  plugin_id: null,
  worker_id: null,
  source: 'openrouter',
  work: 'photos',
  model_id: null,
  generation_id: null,
  tokens_in: 100,
  tokens_out: 5,
  tokens_cached: 0,
  tokens_reasoning: 0,
  audio_in_ms: 0,
  audio_out_ms: 0,
  images: 1,
  video_ms: 0,
  cost_micros: 100,
  cost_state: 'reported',
  meta: {},
});

const frames: readonly LiveWireChange[] = [
  { type: 'change', table: 'ai_usage', operation: 'INSERT', record: usage, seq: 1 },
  {
    type: 'change',
    table: 'ai_usage',
    operation: 'UPDATE',
    key: { id: USAGE_ID },
    set: { cost_state: 'reconciled' },
    seq: 2,
  },
];

let due: (() => void)[] = [];

beforeEach(() => {
  due = [];
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => due.push(callback));
});

describe('AI usage live frames', () => {
  it('leave every store table untouched and wake no table reader', () => {
    const store = new EntityStore();
    const before = store.get().tables;
    const woken = vi.fn();
    store.subscribeSlices(
      Object.keys(before).map((name) => `tables.${name}`),
      woken,
    );
    store.apply(frames);
    for (const callback of due) callback();
    expect(store.get().tables).toBe(before);
    expect(Object.keys(store.get().tables)).not.toContain('ai_usage');
    expect(woken).not.toHaveBeenCalled();
  });
});
