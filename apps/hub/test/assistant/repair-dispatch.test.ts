import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiChatRow, AiRepairGroup } from '@smarteverything/domain';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantDelivery, DELIVERY_RETRY_MS } from '../../src/assistant/delivery';
import { EngineRegistry } from '../../src/assistant/engines/registry';
import type { Engine } from '../../src/assistant/engines/engine';
import {
  RepairDispatch,
  repairEvidenceOf,
  type RepairRequest,
} from '../../src/assistant/repair-dispatch';
import { repairSourceDigest } from '../../src/assistant/repair-source';
import {
  admitExecutionTool,
  currentExecutionAuthority,
  eventAuthority,
  executionRole,
  withExecutionAuthority,
} from '../../src/assistant/turn-authority';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { storedFromLog } from '../../src/store/repositories/runtime-log-types';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const CRASH_STACK = `at example (file.ts:2:1)${'x'.repeat(9000)}`;

let opened: TestStore;
let profileId: string;
let chat: AiChatRow;
let fallback: AiChatRow;
let conversation: ConversationLog;
let repair: RepairDispatch;
let request: RepairRequest;

function newChat(native = false): AiChatRow {
  return opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Work',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: native ? CLAUDE_TEST_ENGINE : TEST_ENGINE,
    ...(native ? ({ nativeAdmission: 'standalone' } as const) : {}),
    tools: ['log_read'],
  });
}

beforeEach(async () => {
  vi.useFakeTimers();
  opened = await testStore();
  const { store } = opened;
  const owner = store.clients.create(
    { name: 'Owner', platform: 'android', role: 'owner', tokenHash: 'owner' },
    true,
  );
  profileId = store.profiles.activeOf(owner.id).id;
  chat = newChat();
  fallback = newChat();
  conversation = new ConversationLog(store);
  repair = new RepairDispatch({
    store,
    conversation,
    repairChat: (): AiChatRow => fallback,
    added: (): undefined => undefined,
  });
  request = {
    id: randomUUID(),
    profileId,
    component: 'hub.service',
    kind: 'manual',
    origin: 'ordinary',
    evidence: repairEvidenceOf({
      source: 'hub:service',
      runtime: 'hub',
      platform: 'server',
      level: 'exception',
      scope: 'hub.service',
      event: 'promise.unhandled',
      failure: { name: 'Error', message: 'example' },
    }),
    recipient: { active: null, previousChatId: chat.id },
  };
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

function queuedEvent(): StoredEvent {
  return opened.store.assistantEvents.event(request.id);
}

function selectedEngine(kind: Engine['kind'], deliver: Engine['deliver']): Engine {
  return {
    kind,
    ownerOnly: kind !== 'dsh',
    status: () => ({ state: 'ready', reason: null }),
    deliver,
    historyChanged: () => Promise.resolve(),
    compact: () => Promise.resolve(true),
    interrupt: () => Promise.resolve(),
  };
}

function delivery(registry: EngineRegistry): AssistantDelivery {
  return new AssistantDelivery({
    events: opened.store.assistantEvents,
    route: (event) => registry.route(event),
    delivered: (event): void => {
      conversation.delivered(event.id);
    },
    failed: (event, reason): void => {
      conversation.failed(event, reason);
    },
    retrying: () => undefined,
    stopped: (event): void => {
      conversation.failed(event, 'Stopped', 'stopped');
    },
    log: testLogger('repair'),
  });
}

function evidence(): {
  readonly record: NonNullable<ReturnType<typeof storedFromLog>>;
  readonly group: AiRepairGroup;
} {
  const { store } = opened;
  const record = storedFromLog(
    {
      timestamp: '2026-10-08T09:59:00.000Z',
      runtime: 'hub',
      level: 'exception',
      scope: 'hub.service',
      event: 'promise.unhandled',
      payload: {},
      failure: { name: 'Error', message: 'Cannot read example', stack: CRASH_STACK },
    },
    { source: 'hub:service', clientId: 'hub', deviceId: null, now: store.now().toISOString() },
  );
  if (record === null) throw new Error('Missing fixture log');
  store.runtimeLogs.append([record], 'hub');
  const group = store.aiRepairInbox.list({ limit: 1 }).groups[0];
  if (group === undefined) throw new Error('Missing fixture group');
  return { record, group };
}

describe('repair through the selected chat engine', () => {
  it.each([false, true])(
    'queues a readable request and uses the existing selected engine (native=%s)',
    async (native) => {
      const { store } = opened;
      chat = newChat(native);
      fallback = chat;
      request = { ...request, recipient: { active: null, previousChatId: chat.id } };
      const { group } = evidence();
      expect(repair.admit({ ...request, fingerprint: group.fingerprint })).toMatchObject({
        kind: 'queued',
        chatId: chat.id,
      });
      const event = queuedEvent();
      expect(event).toMatchObject({ kind: 'chat', client_id: null });
      if (event.message_id === null) throw new Error('Missing visible request');
      expect(store.assistantChat.message(event.message_id)).toMatchObject({
        role: 'person',
        kind: 'text',
        author: 'AI repair',
        state: 'queued',
        origin: { source: 'hub', name: 'AI repair' },
      });
      expect(event.text).toContain('Cannot read example');
      expect(event.text).toContain(CRASH_STACK);
      expect(event.text).toContain('untrusted data');
      expect(event.text).toContain(`retained log ${String(group.latestLogId)}`);
      const authority = eventAuthority(store, event);
      expect(authority).toMatchObject({
        kind: 'service',
        client_id: null,
        role: 'owner',
        tools: ['log_read'],
        hub_os_ban: true,
        repair_origin: request.id,
      });
      expect(executionRole(authority)).toBe('owner');
      expect(() => {
        admitExecutionTool(store, 'log_read', authority);
      }).not.toThrow();
      expect(() => {
        admitExecutionTool(store, 'device_set', authority);
      }).toThrow(/grant/u);
      const deliver = vi.fn<Engine['deliver']>((input, target) => {
        expect(currentExecutionAuthority()?.repair_origin).toBe(request.id);
        conversation.responderInChat({
          chat: target,
          replyTo: input.message_id,
          text: 'Verified the fix.',
        });
        store.assistantEvents.mark(input.id, 'answered_at');
        return Promise.resolve();
      });
      const registry = new EngineRegistry(store);
      registry.attach(selectedEngine(chat.engine.kind, deliver));
      const worker = delivery(registry);
      worker.pump();
      await vi.advanceTimersByTimeAsync(0);
      expect(deliver).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: request.id }),
        expect.objectContaining({ id: chat.id }),
      );
      expect(store.ledger.spentSince('2026-01-01T00:00:00.000Z')).toBe(0);
      worker.stop();
    },
  );

  it('preserves the hub-local OS boundary for a linked native chat', () => {
    const { store } = opened;
    const local = newChat(true);
    fallback = local;
    store.computerAi.bindLocal(CLAUDE_TEST_ENGINE.device_id);
    repair.admit({ ...request, recipient: { active: null, previousChatId: local.id } });
    const registry = new EngineRegistry(store);
    registry.attach(selectedEngine('claude', () => Promise.resolve()));
    const routing = registry.route(queuedEvent());
    expect(routing.kind).toBe('blocked');
    if (routing.kind !== 'blocked') throw new Error('Expected hub-local refusal');
    expect(routing.reason).toContain('Hub-originated work');
  });

  it('keeps repair requests queued instead of mixing their provenance into active chat steering', async () => {
    const { store } = opened;
    let release: () => void = () => undefined;
    const delivered: string[] = [];
    const engine = selectedEngine('dsh', (event) => {
      delivered.push(event.id);
      return new Promise<void>((resolve) => {
        release = (): void => {
          store.assistantEvents.mark(event.id, 'answered_at');
          resolve();
        };
      });
    });
    const steer = vi.fn<NonNullable<Engine['steer']>>(() => Promise.resolve(true));
    const registry = new EngineRegistry(store);
    registry.attach({ ...engine, steer });
    repair.admit(request);
    const worker = delivery(registry);
    worker.pump();
    const next = randomUUID();
    repair.admit({ ...request, id: next });
    worker.pump();
    expect(delivered).toEqual([request.id]);
    expect(steer).not.toHaveBeenCalled();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(delivered).toEqual([request.id, next]);
    release();
    await vi.advanceTimersByTimeAsync(0);
    worker.stop();
  });

  it('preserves source approvals without choosing a separate model or accepting changed snapshots', () => {
    const source = {
      path: 'apps/hub/src/example.ts',
      text: 'export const ready = false;\n',
      digest: repairSourceDigest('export const ready = false;\n'),
    };
    const patch = { revision: 'a'.repeat(40), sources: [source] };
    repair.admit({ ...request, patch });
    expect(queuedEvent().text).toContain(source.text.replace(/\n/gu, '\\n'));
    expect(queuedEvent().text).toContain(patch.revision);
    expect(queuedEvent().text).toContain('propose a source correction for review');
    expect(queuedEvent().text).not.toContain('commit and push the accepted SmartEverything fix');
    const approval = { requestId: randomUUID(), revision: patch.revision, paths: [source.path] };
    expect(repair.existingPatch(request.id, profileId, approval)).toMatchObject({
      kind: 'existing',
    });
    expect(() =>
      repair.existingPatch(request.id, profileId, { ...approval, revision: 'b'.repeat(40) }),
    ).toThrow(/different source approval/u);
    expect(() =>
      repair.admit({
        ...request,
        id: randomUUID(),
        patch: { ...patch, sources: [{ ...source, text: 'changed' }] },
      }),
    ).toThrow(/snapshot changed/u);
  });

  it('deduplicates automatic requests and leaves independent errors queued normally', () => {
    const { store } = opened;
    expect(repair.admit({ ...request, kind: 'automatic' })).toMatchObject({ reason: 'disabled' });
    store.settingsKv.save('ai-repair', { enabled: true });
    const { group } = evidence();
    const automatic = { ...request, kind: 'automatic' as const, fingerprint: group.fingerprint };
    expect(repair.admit(automatic)).toMatchObject({ kind: 'queued' });
    expect(repair.admit(automatic)).toMatchObject({ kind: 'existing' });
    expect(repair.admit({ ...automatic, id: randomUUID() })).toMatchObject({
      kind: 'held',
      reason: 'evidence',
    });
    expect(repair.admit({ ...request, id: randomUUID() })).toMatchObject({ kind: 'queued' });
    expect(store.assistantEvents.pending()).toHaveLength(2);
  });

  it('keeps owner isolation while admitting errors from repair and unknown origins', () => {
    expect(repair.admit({ ...request, profileId: randomUUID() })).toMatchObject({
      reason: 'owner',
    });
    expect(repair.admit({ ...request, origin: 'unknown' })).toMatchObject({ kind: 'queued' });
    expect(repair.admit({ ...request, id: randomUUID(), origin: 'repair' })).toMatchObject({
      kind: 'queued',
    });
    const authority = eventAuthority(opened.store, queuedEvent());
    withExecutionAuthority(authority, () => {
      expect(repair.admit({ ...request, id: randomUUID() })).toMatchObject({ kind: 'queued' });
      const child = opened.store.assistantEvents.add({
        ...queuedEvent(),
        id: randomUUID(),
        message_id: null,
      });
      expect(eventAuthority(opened.store, child)).toMatchObject({
        repair_origin: request.id,
        role: 'owner',
        tools: ['log_read'],
        hub_os_ban: true,
      });
    });
  });

  it('always routes to the dedicated repair chat regardless of active and previous work', () => {
    const active = newChat();
    const recipient = {
      active: { chatId: active.id, expiresAt: '2026-10-08T11:00:00.000Z' },
      previousChatId: chat.id,
    };
    expect(repair.admit({ ...request, recipient })).toMatchObject({ chatId: fallback.id });
    expect(
      repair.admit({
        ...request,
        id: randomUUID(),
        recipient: { active: null, previousChatId: randomUUID() },
      }),
    ).toMatchObject({ chatId: fallback.id });
    expect(opened.store.assistantEvents.pending().map((event) => event.chat_id)).toEqual([
      fallback.id,
      fallback.id,
    ]);
    expect(queuedEvent().text).toContain('smarteverything-coding-process');
    expect(queuedEvent().text).toContain('smarteverything-coding-checks');
    expect(queuedEvent().text).toContain('smarteverything-coding-review');
    expect(queuedEvent().text).toContain('smarteverything-self-update');
    expect(queuedEvent().text).toContain('commit and push the accepted SmartEverything fix');
    expect(queuedEvent().text).toContain('fetching and pulling/merging remote main');
    expect(queuedEvent().text).toContain('resolving conflicts');
    expect(queuedEvent().text).toContain('the NAS is the production Hub');
    expect(queuedEvent().text).toContain('one release at a time');
    expect(queuedEvent().text).toContain(
      'release all needed Hub, Android, desktop native and UI updates',
    );
  });

  it('rejects dismissed evidence and accepts a new observation without duplicating the old request', () => {
    const { store } = opened;
    const { record, group } = evidence();
    const input = { ...request, fingerprint: group.fingerprint };
    repair.admit(input);
    store.assistantEvents.mark(request.id, 'answered_at');
    store.aiRepairInbox.dismiss({ kind: 'inactive' });
    expect(repair.admit(input)).toMatchObject({ kind: 'existing' });
    const next = { ...input, id: randomUUID() };
    expect(repair.admit(next)).toMatchObject({ reason: 'evidence' });
    store.runtimeLogs.append([{ ...record, at: '2026-10-08T10:00:00.000Z' }], 'hub');
    expect(repair.admit(next)).toMatchObject({ kind: 'queued' });
  });

  it('uses normal retry and stop behavior and records the visible failure in the inbox', async () => {
    const { store } = opened;
    const { group } = evidence();
    repair.admit({ ...request, fingerprint: group.fingerprint });
    const registry = new EngineRegistry(store);
    const deliver = vi.fn<Engine['deliver']>(() =>
      Promise.reject(new Error('Engine disconnected')),
    );
    registry.attach(selectedEngine('dsh', deliver));
    const worker = delivery(registry);
    worker.pump();
    await vi.advanceTimersByTimeAsync(DELIVERY_RETRY_MS);
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(worker.stopChat(chat.id)).toBe(false);
    expect(worker.stopChat(fallback.id)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.aiRepairInbox.list({ limit: 1 }).groups[0]?.progress).toBe('failed');
    expect(store.assistantChat.message(queuedEvent().message_id ?? '')).toMatchObject({
      state: 'failed',
      reason_code: 'stopped',
    });
    worker.stop();
  });
});
