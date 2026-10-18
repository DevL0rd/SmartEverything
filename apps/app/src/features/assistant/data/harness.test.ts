import { LIVE_CHANGE, type LiveChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import { refetchOnBindingChange } from './harness';

const CHAT = '00000000-0000-4000-8000-0000000000c1';
const PROFILE = '00000000-0000-4000-8000-0000000000a1';
const OTHER_PROFILE = '00000000-0000-4000-8000-0000000000a2';
const NOW = '2026-10-17T10:00:00.000Z';

function chatChange(
  seq: number,
  fields: { readonly profile: string; readonly model: string | null; readonly title: string },
): LiveChange {
  return LIVE_CHANGE.parse({
    type: 'change',
    table: 'ai_chats',
    operation: seq === 1 ? 'INSERT' : 'UPDATE',
    seq,
    record: {
      id: CHAT,
      profile_id: fields.profile,
      kind: 'chat',
      title: fields.title,
      icon: null,
      parent_id: null,
      source_key: null,
      engine: { kind: 'openrouter', model: fields.model, effort: null },
      tools: null,
      pinned: false,
      archived_at: null,
      cost_micros: 0,
      last_message_at: null,
      created_at: NOW,
      updated_at: NOW,
    },
    oldRecord: null,
  });
}

function openStore(refetch: () => void): EntityStore {
  const store = new EntityStore();
  store.apply([chatChange(1, { profile: PROFILE, model: 'a/b', title: 'First' })]);
  refetchOnBindingChange(store, CHAT, refetch);
  return store;
}

describe('refetchOnBindingChange', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (): number => 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refetches once when the chat engine changes', () => {
    const refetch = vi.fn();
    const store = openStore(refetch);
    store.apply([chatChange(2, { profile: PROFILE, model: 'c/d', title: 'First' })]);
    store.subscriptions.flush();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refetches once when the chat moves to another profile', () => {
    const refetch = vi.fn();
    const store = openStore(refetch);
    store.apply([chatChange(2, { profile: OTHER_PROFILE, model: 'a/b', title: 'First' })]);
    store.subscriptions.flush();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('stays quiet for changes that do not touch the binding', () => {
    const refetch = vi.fn();
    const store = openStore(refetch);
    store.apply([chatChange(2, { profile: PROFILE, model: 'a/b', title: 'Renamed' })]);
    store.setSync({ status: 'live' });
    store.subscriptions.flush();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('stops listening once unsubscribed', () => {
    const refetch = vi.fn();
    const store = new EntityStore();
    store.apply([chatChange(1, { profile: PROFILE, model: 'a/b', title: 'First' })]);
    const stop = refetchOnBindingChange(store, CHAT, refetch);
    stop();
    store.apply([chatChange(2, { profile: PROFILE, model: 'c/d', title: 'First' })]);
    store.subscriptions.flush();
    expect(refetch).not.toHaveBeenCalled();
  });
});
