import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DSH_SESSION_EVENTS_WRITE, DSH_SESSION_HEADER } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessHost,
  AssistantMessageRow,
  DshSessionEvent,
  DshWriterClaim,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session';
import type { SessionHeader } from '@deepseek-ai/dsh-session';
import { HELPER_SETTLEMENT_PROOF } from '@smarteverything/harness/process';
import { readSession } from '../../../src/harness/attach';
import {
  helperContinuationReady,
  prepareHelperContinuation,
  submitHelperContinuation,
} from '../../../src/assistant/engines/dsh/helper-continuation';
import { LocalHarnessPersistence } from '../../../src/harness/local-persistence';
import type { HarnessGrant } from '../../../src/harness/grant';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { sendHelperDialogue } from '../../../src/assistant/delegation/helper-dialogue';
import { EngineRegistry } from '../../../src/assistant/engines/registry';
import { AssistantFiles } from '../../../src/assistant/files';
import {
  adoptNativeChild,
  lastAssistantText,
  nativeChildOutcome,
  settleNativeChild,
  watchNativeSessions,
} from '../../../src/assistant/engines/dsh/children';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import type { HubTool, HubToolResult, ToolCaller } from '../../../src/ai-tools/hub-tool';
import { HarnessHubTools } from '../../../src/harness/tools';
import { workOf } from '../../../src/harness/metered-accounting';
import { controlAgent } from '../../../src/assistant/agent-runs/controls';
import { acknowledge, harnessRig, type Rig } from './support/rig';
import { hubLayout } from '../../../src/data-layout';

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const NOW = '2026-10-25T05:00:00.000Z';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function assistant(seq: number, text: string): DshSessionEvent {
  return {
    type: 'assistant/message',
    seq,
    time: 1_000 + seq,
    data: {
      turn: 0,
      step: 0,
      stream: [],
      message: {
        id: randomUUID(),
        role: 'assistant',
        source: { kind: 'model', provider: 'scripted', model: 'model-a' },
        content: [{ type: 'text', text }],
      },
    },
    surfaceOp: 'append',
  };
}

function turnEnd(seq: number, kind: string): DshSessionEvent {
  return { type: 'turn/end', seq, time: 1_000 + seq, data: { turn: 0, reason: { kind } } };
}

function launched(): {
  readonly rig: Rig;
  readonly parentChatId: string;
  readonly parentSession: string;
  readonly adopt: () => ReturnType<typeof adoptNativeChild>;
} {
  const made = rig;
  if (made === undefined) throw new Error('The rig is missing.');
  const chat = made.newChat(made.hub.target);
  const open = made.service.prepare(made.owner, chat.id, made.authority, made.clientId);
  const host = made.service.directory.get(made.hub.target).host;
  const principal = made.service.hostPrincipal(made.owner.profileId, host);
  const header = DSH_SESSION_HEADER.parse({
    version: 4,
    id: randomUUID(),
    createdAt: Date.now(),
    cwd: '/tmp/work',
    isSeeded: false,
    parentSession: open.claim.session_id,
    origin: 'subagent',
    delegationDepth: 1,
  });
  return {
    rig: made,
    parentChatId: chat.id,
    parentSession: open.claim.session_id,
    adopt: () =>
      adoptNativeChild(made.opened.store, new ConversationLog(made.opened.store), {
        principal,
        attach: {
          target: open.claim.target,
          runtime_instance: open.claim.runtime_instance,
          connection_generation: open.claim.connection_generation,
        },
        header,
        inherited: 0,
        label: 'Check the garage lights',
        task: 'Find which garage lights are on and report.',
        now: NOW,
      }),
  };
}

describe('a native child of a native conversation', () => {
  it('appears as the same helper chat and agent row a hub-started helper has', async () => {
    rig = await harnessRig();
    const world = launched();
    const { chat, run, opened } = world.adopt();
    const { store } = world.rig.opened;

    expect(chat).toMatchObject({ kind: 'subagent', parent_id: world.parentChatId });
    expect(chat.engine).toMatchObject({ kind: 'dsh', session_id: opened.claim.session_id });
    expect(run).toMatchObject({
      source: 'smarteverything',
      parent_chat_id: world.parentChatId,
      child_chat_id: chat.id,
      runtime: 'dsh',
      state: 'running',
      supported_actions: ['open_chat', 'send', 'interrupt'],
      task: 'Find which garage lights are on and report.',
      cwd: '/tmp/work',
    });
    expect(store.aiAgentRuns.currentChild(chat.id)?.id).toBe(run.id);
    expect(store.aiAgentRuns.list(world.parentChatId, { limit: 10 }).runs.map((r) => r.id)).toEqual(
      [run.id],
    );
    const task = store.assistantChat.messages({ chatId: chat.id, limit: 10 });
    expect(task.map((row) => row.text)).toEqual(['Find which garage lights are on and report.']);
    expect(store.assistantEvents.event(run.source_id).delivered_at).not.toBeNull();
    expect(store.assistantEvents.pendingSubagentRoots()).toEqual([]);
  });

  it('is settled once with the final answer when its turn ends', async () => {
    rig = await harnessRig();
    const world = launched();
    const { run } = world.adopt();
    const { store } = world.rig.opened;
    const sessionId = run.session_id ?? '';
    const principal = world.rig.service.hostPrincipal(
      world.rig.owner.profileId,
      world.rig.service.directory.get(world.rig.hub.target).host,
    );
    const claim = store.dshSessions.attached(sessionId, world.rig.owner.profileId);
    if (claim === null) throw new Error('The child lost its writer.');
    watchNativeSessions(store, new ConversationLog(store), () => new Date(NOW));
    store.dshSessions.append(
      {
        claim,
        operation_id: randomUUID(),
        events: DSH_SESSION_EVENTS_WRITE.parse([
          assistant(0, 'Two lights are on.'),
          turnEnd(1, 'completed'),
        ]),
      },
      principal,
    );

    expect(store.aiAgentRuns.read(run.id)).toMatchObject({
      state: 'completed',
      result: 'Two lights are on.',
      error: null,
      completed_at: NOW,
      supported_actions: ['open_chat', 'delete'],
    });
    expect(store.assistantEvents.event(run.source_id).answered_at).not.toBeNull();
    const again = settleNativeChild(store, sessionId, [turnEnd(2, 'error')], NOW);
    expect(again).toBeUndefined();
    expect(store.aiAgentRuns.read(run.id).state).toBe('completed');
  });

  it('takes an owner message while running and refuses one after it settled', async () => {
    rig = await harnessRig();
    const world = launched();
    const { chat, run } = world.adopt();
    const { store } = world.rig.opened;
    const sent: [string, string][] = [];
    const ports = {
      store,
      interrupt: (): Promise<void> => Promise.resolve(),
      send: (to: { readonly id: string }, text: string): void => {
        sent.push([to.id, text]);
      },
      computer: (): undefined => undefined,
    };

    await controlAgent(ports, run, { action: 'send', text: 'Also check the porch.' });
    expect(sent).toEqual([[chat.id, 'Also check the porch.']]);

    store.assistantEvents.mark(run.source_id, 'answered_at');
    await expect(controlAgent(ports, run, { action: 'send', text: 'Too late.' })).rejects.toThrow(
      'no longer running',
    );
    expect(sent).toHaveLength(1);
  });

  it('refuses a child that does not name a parent session of the same profile', async () => {
    rig = await harnessRig();
    const world = launched();
    const { store } = world.rig.opened;
    const orphan = DSH_SESSION_HEADER.parse({
      version: 4,
      id: randomUUID(),
      createdAt: Date.now(),
      isSeeded: false,
    });
    const principal = world.rig.service.hostPrincipal(
      world.rig.owner.profileId,
      world.rig.service.directory.get(world.rig.hub.target).host,
    );

    expect(() =>
      adoptNativeChild(store, new ConversationLog(store), {
        principal,
        attach: {
          target: world.rig.hub.target,
          runtime_instance: randomUUID(),
          connection_generation: randomUUID(),
        },
        header: orphan,
        inherited: 0,
        label: '',
        task: 'x',
        now: NOW,
      }),
    ).toThrow('must name its parent session');
  });
});

function subagentHeader(parentSession: string): SessionHeader {
  return {
    version: SESSION_FORMAT_VERSION,
    id: SessionId(randomUUID()),
    createdAt: Date.now(),
    cwd: '/tmp/work',
    isSeeded: false,
    parentSession: SessionId(parentSession),
    origin: 'subagent',
    delegationDepth: 1,
  };
}

function parented(made: Rig): {
  readonly persistence: LocalHarnessPersistence;
  readonly parentChatId: string;
  readonly parentSession: string;
} {
  const chat = made.newChat(made.hub.target);
  const open = made.service.prepare(made.owner, chat.id, made.authority, made.clientId);
  const persistence = new LocalHarnessPersistence(made.service);
  persistence.bind(open.claim);
  return { persistence, parentChatId: chat.id, parentSession: open.claim.session_id };
}

describe('a native child created through the hub session persistence', () => {
  it('gets its agent row, chat and execution grant when the plugin creates its session', async () => {
    rig = await harnessRig();
    const { persistence, parentChatId, parentSession } = parented(rig);
    const header = subagentHeader(parentSession);

    const writer = await persistence.create(header, 0);
    const { store } = rig.opened;
    const run = store.aiAgentRuns.currentOfSession(header.id);

    expect(writer.claim.session_id).toBe(header.id);
    expect(persistence.boundClaim(header.id)).toEqual(writer.claim);
    expect(run).toMatchObject({
      parent_chat_id: parentChatId,
      runtime: 'dsh',
      state: 'running',
      task: null,
      session_id: header.id,
      supported_actions: ['open_chat', 'send', 'interrupt'],
    });
    expect(store.aiChats.chat(run?.child_chat_id ?? '')).toMatchObject({
      kind: 'subagent',
      parent_id: parentChatId,
      title: 'Subagent',
    });
    expect(store.harnessSessions.grant(header.id)).toMatchObject({
      session_id: header.id,
      cwd: '/tmp/work',
      profile_id: rig.owner.profileId,
    });
    expect(store.harnessSessions.state(header.id)).toMatchObject({
      chat_id: run?.child_chat_id,
      epoch: writer.claim.epoch,
      state: 'idle',
    });
    expect((await persistence.acquire(header.id)).claim).toEqual(writer.claim);
  });

  it('refuses a session that is not a subagent of a session this hub is writing', async () => {
    rig = await harnessRig();
    const { persistence } = parented(rig);
    const plain: SessionHeader = {
      version: SESSION_FORMAT_VERSION,
      id: SessionId(randomUUID()),
      createdAt: Date.now(),
      isSeeded: false,
    };

    await expect(persistence.create(plain, 0)).rejects.toThrow('initiating conversation grant');
    await expect(persistence.create(subagentHeader(randomUUID()), 0)).rejects.toThrow(
      'no active writer',
    );
  });

  it('names its chat and row from the descriptor and takes the task from its first message', async () => {
    rig = await harnessRig();
    const { persistence, parentSession } = parented(rig);
    const header = subagentHeader(parentSession);
    const writer = await persistence.create(header, 0);
    const { store } = rig.opened;
    watchNativeSessions(store, new ConversationLog(store), () => new Date(NOW));
    const principal = rig.service.hostPrincipal(
      rig.owner.profileId,
      rig.service.directory.get(rig.hub.target).host,
    );
    store.dshSessions.append(
      {
        claim: writer.claim,
        operation_id: randomUUID(),
        events: DSH_SESSION_EVENTS_WRITE.parse([
          {
            type: 'subagent/descriptor',
            seq: 0,
            time: 1_000,
            data: { version: 1, mode: 'continuable', provider: 'spawn', label: 'Garage lights' },
          },
          {
            type: 'user/message',
            seq: 1,
            time: 1_001,
            surfaceOp: 'append',
            data: {
              id: randomUUID(),
              role: 'user',
              source: { kind: 'user' },
              content: [{ type: 'text', text: 'Find which garage lights are on.' }],
            },
          },
        ]),
      },
      principal,
    );

    const run = store.aiAgentRuns.currentOfSession(header.id);
    expect(run).toMatchObject({
      title: 'Garage lights',
      task: 'Find which garage lights are on.',
      state: 'running',
    });
    expect(store.aiChats.chat(run?.child_chat_id ?? '').title).toBe('Garage lights');
  });
});

describe('a native child running inside its parent session', () => {
  it('shows its task and answers in its own chat and keeps its latest activity time', async () => {
    rig = await harnessRig();
    const { persistence, parentSession } = parented(rig);
    const header = subagentHeader(parentSession);
    const writer = await persistence.create(header, 0);
    const { store } = rig.opened;
    watchNativeSessions(store, new ConversationLog(store), () => new Date(NOW));
    const principal = rig.service.hostPrincipal(
      rig.owner.profileId,
      rig.service.directory.get(rig.hub.target).host,
    );
    const append = (events: readonly unknown[]): void => {
      store.dshSessions.append(
        {
          claim: writer.claim,
          operation_id: randomUUID(),
          events: DSH_SESSION_EVENTS_WRITE.parse(events),
        },
        principal,
      );
    };
    append([
      {
        type: 'user/message',
        seq: 0,
        time: 1_000,
        surfaceOp: 'append',
        data: {
          id: randomUUID(),
          role: 'user',
          source: { kind: 'user' },
          content: [{ type: 'text', text: 'Find which garage lights are on.' }],
        },
      },
      assistant(1, 'Two lights are on.'),
    ]);
    const run = store.aiAgentRuns.currentOfSession(header.id);
    const messages = store.assistantChat.messages({ chatId: run?.child_chat_id ?? '', limit: 10 });

    expect(messages.toReversed().map((row) => [row.role, row.text])).toEqual([
      ['person', 'Find which garage lights are on.'],
      ['responder', 'Two lights are on.'],
    ]);
    expect(run?.updated_at).toBe(new Date(1_001).toISOString());
  });
});

describe('the model inference grant of a native child through the hub session persistence', () => {
  it('is bound to the child own task event so metered work is accounted as subagent work', async () => {
    rig = await harnessRig();
    const { persistence, parentChatId, parentSession } = parented(rig);
    const { store } = rig.opened;
    const parentEvent = store.assistantEvents.add({
      id: randomUUID(),
      kind: 'chat',
      chat_id: parentChatId,
      message_id: null,
      profile_id: rig.owner.profileId,
      client_id: rig.clientId,
      text: 'delegate',
    });
    store.harnessSessions.issue({
      ...rig.service.storage.grant(parentSession),
      event_id: parentEvent.id,
    });
    const header = subagentHeader(parentSession);
    await persistence.create(header, 0);
    const run = store.aiAgentRuns.currentOfSession(header.id);
    const grant = rig.service.storage.grant(header.id);

    expect(run?.child_chat_id).not.toBe(parentChatId);
    expect(grant.event_id).toBe(run?.source_id);
    expect(store.assistantEvents.event(grant.event_id ?? '')).toMatchObject({
      chat_id: run?.child_chat_id,
      report_to: parentChatId,
    });
    expect(workOf(rig.service, grant, run?.child_chat_id ?? '')).toBe('subagent');
    expect(workOf(rig.service, rig.service.storage.grant(parentSession), parentChatId)).toBe(
      'chat',
    );
  });
});

function homeTool(name: string, readOnlyHint: boolean): HubTool {
  return {
    name,
    title: name,
    description: `The ${name} tool.`,
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint, destructiveHint: !readOnlyHint, openWorldHint: false },
    origin: { kind: 'se' },
    humanOnly: false,
  };
}

function homeHub(callers: ToolCaller[]): ToolHub {
  const tools = [homeTool('home_read', true), homeTool('device_control', false)];
  return new ToolHub([
    {
      tools: (): HubTool[] => tools,
      call: (_entry, _args, caller): Promise<HubToolResult> => {
        callers.push(caller);
        return Promise.resolve({ response: { rooms: 2 }, line: '', pictures: [] });
      },
      validate: (): null => null,
      changes: (): (() => void) => (): void => undefined,
    },
  ]);
}

describe('a hub tool called by a native child through the hub session persistence', () => {
  it('runs under the parent profile and authority against the child chat', async () => {
    rig = await harnessRig();
    const { persistence, parentSession } = parented(rig);
    const header = subagentHeader(parentSession);
    await persistence.create(header, 0);
    const callers: ToolCaller[] = [];
    const access = new HarnessHubTools(rig.service, homeHub(callers));
    const childChat = rig.opened.store.aiAgentRuns.currentOfSession(header.id)?.child_chat_id;

    const result = await access.call(header.id, 'home_read', {});

    expect(result.response).toEqual({ rooms: 2 });
    expect(callers).toHaveLength(1);
    expect(callers[0]).toMatchObject({
      profileId: rig.owner.profileId,
      chatId: childChat,
      role: 'owner',
    });
    expect(access.nativeAccess(header.id)).toBe(true);
  });

  it('is limited to the tools the parent chat allows', async () => {
    rig = await harnessRig();
    const { persistence, parentChatId, parentSession } = parented(rig);
    rig.opened.store.aiChats.update(parentChatId, { tools: ['home_read'] });
    const header = subagentHeader(parentSession);
    await persistence.create(header, 0);
    const access = new HarnessHubTools(rig.service, homeHub([]));

    const offered = access
      .scoped(header.id)
      .list()
      .map((tool) => tool.name);
    expect(offered).toContain('home_read');
    expect(offered).not.toContain('device_control');
    await expect(access.call(header.id, 'device_control', {})).rejects.toThrow();
  });
});

describe('reading how a native child ended', () => {
  it('maps the end of a turn to the state the agent rows use', () => {
    expect(nativeChildOutcome([turnEnd(0, 'completed')])?.state).toBe('completed');
    expect(nativeChildOutcome([turnEnd(0, 'aborted')])?.state).toBe('interrupted');
    expect(nativeChildOutcome([turnEnd(0, 'error')])?.state).toBe('failed');
    expect(nativeChildOutcome([assistant(0, 'still going')])).toBeUndefined();
  });

  it('takes the last assistant message that has text as the answer', () => {
    expect(
      lastAssistantText([assistant(0, 'first'), assistant(1, 'second'), turnEnd(2, 'completed')]),
    ).toBe('second');
    expect(lastAssistantText([turnEnd(0, 'completed')])).toBe('');
  });
});

it('keeps a settled helper in its original continuation when its transcript is opened', async () => {
  rig = await harnessRig();
  const { persistence, parentSession } = parented(rig);
  const { claim } = await persistence.create(subagentHeader(parentSession), 0);
  const { store } = rig.opened;
  const run = store.aiAgentRuns.currentOfSession(claim.session_id);
  const childChatId = run?.child_chat_id ?? null;
  if (childChatId === null) throw new Error('The native helper was not adopted.');
  const chat = store.aiChats.chat(childChatId);
  const parentClaim = persistence.claim(parentSession);
  const connection = rig.service.directory.get(rig.hub.target);
  const manifest = connection.host.manifest;
  if (manifest === null) throw new Error('The fixture host has no manifest.');
  rig.hub.held.set(parentSession, parentClaim.epoch);
  rig.service.directory.register({
    ...connection,
    host: { ...connection.host, manifest: { ...manifest, features: ['subagent-send'] } },
  });
  const grant = store.harnessSessions.grant(claim.session_id);
  expect(helperContinuationReady(rig.service, chat, rig.owner.role)).toBeNull();

  const session = await readSession(rig.service, {
    owner: rig.owner,
    chatId: chat.id,
    clientId: rig.clientId,
  });

  expect(session.epoch).toBe(claim.epoch);
  expect(rig.hub.requests).toEqual([]);
  expect(store.harnessSessions.grant(claim.session_id)).toEqual(grant);
  expect(helperContinuationReady(rig.service, chat, rig.owner.role)).toBeNull();
});

it('can answer a helper approval after its runtime reopens under the same epoch', async () => {
  rig = await harnessRig();
  const { persistence, parentSession } = parented(rig);
  const { claim } = await persistence.create(subagentHeader(parentSession), 0);
  const { store } = rig.opened;
  const state = store.harnessSessions.state(claim.session_id);
  if (state === undefined) throw new Error('The helper session was not projected.');
  store.harnessSessions.project(state, 600);
  const frame = { session_id: claim.session_id, epoch: claim.epoch };
  rig.service.native({ ...frame, kind: 'open' });
  rig.service.native({ ...frame, kind: 'close' });
  rig.service.native({ ...frame, kind: 'open' });
  const interaction = {
    id: 'helper-approval',
    epoch: claim.epoch,
    kind: 'permission',
    request: {},
  } as const;

  rig.service.native({
    ...frame,
    kind: 'interactions',
    interactions: [interaction],
    added: interaction,
  });

  expect(store.harnessSessions.state(claim.session_id)?.interactions).toEqual([interaction]);
  await rig.service.answer(rig.owner, state.chat_id, {
    operation_id: randomUUID(),
    interaction_id: interaction.id,
    expected_epoch: claim.epoch,
    answer: { kind: 'allow' },
  });
  expect(rig.hub.requests).toContainEqual(
    expect.objectContaining({ kind: 'answer', session_id: claim.session_id }),
  );
});

function retainChildSettlement(
  fixture: Rig,
  persistence: LocalHarnessPersistence,
  parentSession: string,
  child: DshWriterClaim,
): void {
  const priorParent = persistence.claim(parentSession);
  const principal = fixture.service.hostPrincipal(
    fixture.owner.profileId,
    fixture.service.directory.get(fixture.hub.target).host,
  );
  const { store } = fixture.opened;
  const metadata = store.dshSessions.stat(parentSession, fixture.owner.profileId);
  if (metadata === undefined) throw new Error('The parent session was not retained.');
  store.dshSessions.append(
    {
      claim: priorParent,
      operation_id: randomUUID(),
      events: DSH_SESSION_EVENTS_WRITE.parse([
        {
          type: HELPER_SETTLEMENT_PROOF,
          seq: metadata.next_seq,
          time: 1_002,
          ignorable: true,
          data: { childSessionId: child.session_id, writerEpoch: child.epoch, nextSeq: 2 },
        },
      ]),
    },
    principal,
  );
}

function adoptedHelper(
  fixture: Rig,
  sessionId: string,
): { readonly child: AiChatRow; readonly grant: HarnessGrant } {
  const { store } = fixture.opened;
  const adoption = store.aiAgentRuns.currentOfSession(sessionId);
  const grant = store.harnessSessions.grant(sessionId);
  const childChatId = adoption?.child_chat_id ?? null;
  if (childChatId === null || grant === undefined)
    throw new Error('The native helper was not adopted.');
  return { child: store.aiChats.chat(childChatId), grant };
}

it.each([
  ['initial claim with native settlement', 'with'],
  ['initial claim without native settlement', 'without'],
  ['retry after the first replacement dies before binding', 'retry'],
] as const)('handles cold helper continuation for %s', async (_description, settlement) => {
  rig = await harnessRig();
  const { persistence, parentChatId, parentSession } = parented(rig);
  const old = (await persistence.create(subagentHeader(parentSession), 0)).claim;
  const { store } = rig.opened;
  store.dshSessions.append(
    {
      claim: old,
      operation_id: randomUUID(),
      events: DSH_SESSION_EVENTS_WRITE.parse([
        { type: 'turn/start', seq: 0, time: 1_000, data: { turn: 1 } },
        {
          type: 'turn/end',
          seq: 1,
          time: 1_001,
          data: { turn: 1, reason: { kind: 'completed' } },
        },
      ]),
    },
    rig.service.hostPrincipal(rig.owner.profileId, rig.service.directory.get(rig.hub.target).host),
  );
  if (settlement !== 'without') retainChildSettlement(rig, persistence, parentSession, old);
  const { child, grant } = adoptedHelper(rig, old.session_id);
  const host = rig.service.directory.get(rig.hub.target);
  const manifest = host.host.manifest;
  if (manifest === null) throw new Error('The fixture host has no manifest.');
  const claims: DshWriterClaim[] = [];
  const fixture = rig;
  const route = fixture.service.routes.selected(fixture.owner.profileId, fixture.route, false);
  let failBeforeBinding = settlement === 'retry';
  const reconnect = async (): Promise<Extract<HarnessRuntimeRequest, { kind: 'open' }>> => {
    fixture.service.directory.register({
      ...host,
      host: {
        ...host.host,
        runtime_instance: randomUUID(),
        connection_generation: randomUUID(),
        manifest: { ...manifest, features: ['subagent-send', 'subagent-resume'] },
      },
      execute: (id, request) => {
        if (request.kind === 'open' && request.mode === 'continue') {
          claims.push(request.claim);
          if (failBeforeBinding) {
            failBeforeBinding = false;
            return Promise.reject(new Error('The new host died before binding the helper.'));
          }
          return Promise.resolve(acknowledge(request));
        }
        if (host.execute === undefined) throw new Error('The fixture host cannot open the parent.');
        return host.execute(id, request);
      },
    });
    fixture.service.routes.publish(route);
    const parent = fixture.service.prepare(
      fixture.owner,
      parentChatId,
      fixture.authority,
      fixture.clientId,
    );
    await fixture.service.directory.execute(fixture.hub.target, randomUUID(), parent);
    return parent;
  };
  let parent = await reconnect();
  const pending = (): readonly string[] => [];
  if (settlement === 'without') {
    expect(
      helperContinuationReady(rig.service, child, rig.owner.role, { pendingInput: pending }),
    ).toMatch(/activation has no confirmed settlement/);
    await expect(
      prepareHelperContinuation(rig.service, child, rig.owner.role, { pendingInput: pending }),
    ).rejects.toThrow(/activation has no confirmed settlement/);
    expect(claims).toEqual([]);
    expect(store.dshSessions.attached(old.session_id, rig.owner.profileId)).toEqual(old);
    return;
  }
  expect(
    helperContinuationReady(rig.service, child, rig.owner.role, { pendingInput: pending }),
  ).toBeNull();
  if (settlement === 'retry') {
    await expect(
      prepareHelperContinuation(rig.service, child, rig.owner.role, { pendingInput: pending }),
    ).rejects.toThrow(/host died before binding/);
    expect(store.dshSessions.attached(old.session_id, rig.owner.profileId)?.epoch).toBe(
      old.epoch + 1,
    );
    parent = await reconnect();
    expect(
      helperContinuationReady(rig.service, child, rig.owner.role, { pendingInput: pending }),
    ).toBeNull();
  }

  await expect(
    prepareHelperContinuation(rig.service, child, rig.owner.role, { pendingInput: pending }),
  ).resolves.toMatchObject({ child: { session_id: old.session_id }, parent: parent.claim });

  expect(claims).toHaveLength(settlement === 'retry' ? 2 : 1);
  expect(claims.at(-1)).toMatchObject({
    session_id: old.session_id,
    epoch: old.epoch + claims.length,
    runtime_instance: parent.claim.runtime_instance,
    connection_generation: parent.claim.connection_generation,
  });
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.hub.target).host,
  );
  expect(() => store.dshSessions.verifyWriter(old, principal)).toThrow();
  expect(store.harnessSessions.grant(old.session_id)).toEqual({
    ...grant,
    runtime_instance: parent.claim.runtime_instance,
    generation: parent.claim.connection_generation,
  });
  expect(rig.hub.held.has(old.session_id)).toBe(false);
});

type HostFeature = NonNullable<AiHarnessHost['manifest']>['features'][number];

interface DirectedFilesFixture {
  readonly parent: AiChatRow;
  readonly child: AiChatRow;
  readonly files: AssistantFiles;
  readonly setFeatures: (features: readonly HostFeature[]) => void;
  readonly send: (
    attachments: string[],
    reply?: { readonly text: string; readonly quotedMessageId: string },
  ) => Promise<AssistantMessageRow>;
}

function helperFeatures(fixture: Rig): DirectedFilesFixture['setFeatures'] {
  const { service } = fixture;
  return (features): void => {
    const { host } = service.directory.get(fixture.hub.target);
    if (host.manifest === null) throw new Error('The fixture host has no manifest.');
    service.directory.updateManifest(host, { ...host.manifest, features: [...features] });
  };
}

async function directedFilesFixture(fixture: Rig): Promise<DirectedFilesFixture> {
  const { service, opened, owner, clientId } = fixture;
  const { store } = opened;
  const { persistence, parentSession, parentChatId } = parented(fixture);
  const { claim } = await persistence.create(subagentHeader(parentSession), 0);
  const { child } = adoptedHelper(fixture, claim.session_id);
  fixture.hub.held.set(parentSession, persistence.claim(parentSession).epoch);
  const files = new AssistantFiles({
    layout: hubLayout(opened.directory, {}),
    chat: store.assistantChat,
    now: (): Date => new Date(),
  });
  const conversation = new ConversationLog(store);
  const engines = new EngineRegistry(store);
  engines.attach({
    kind: 'dsh',
    ownerOnly: false,
    helperReady: (chat, role, attachments) =>
      helperContinuationReady(service, chat, role, { attachments, pendingInput: () => [] }),
    status: () => ({ state: 'ready', reason: null }),
    deliver: () => Promise.resolve(),
    historyChanged: () => Promise.resolve(),
    compact: () => Promise.resolve(false),
    interrupt: () => Promise.resolve(),
  });
  const ports = {
    store,
    conversation,
    engines,
    files,
    added: (): void => undefined,
    queueRun: (): void => undefined,
  };
  const sender = { clientId, profileId: owner.profileId };
  const clientMessageId = randomUUID();
  const parent = store.aiChats.chat(parentChatId);
  return {
    parent,
    child,
    files,
    setFeatures: helperFeatures(fixture),
    send: (attachments, reply) =>
      sendHelperDialogue(ports, sender, parent, {
        text: reply?.text ?? '',
        attachments,
        client_message_id: clientMessageId,
        helper_target: { chat_id: child.id },
        ...(reply === undefined ? {} : { quote_message_id: reply.quotedMessageId }),
      }),
  };
}

async function directedUpload(
  fixture: Rig,
  files: AssistantFiles,
  name: string,
  image?: Buffer,
): Promise<string> {
  const content = image ?? Buffer.from(name);
  const mime = image === undefined ? 'text/plain' : 'image/png';
  const profileId = fixture.owner.profileId;
  const upload = await files.start({ profileId, name, mime, bytes: content.length });
  await files.chunk(profileId, upload.uploadId, 0, content.toString('base64'));
  return (await files.finish(profileId, upload.uploadId)).id;
}

it('rechecks the host after copying and leaves the draft intact if capability disappears', async () => {
  rig = await harnessRig();
  const { files, send, setFeatures } = await directedFilesFixture(rig);
  const id = await directedUpload(rig, files, 'context.txt');
  setFeatures(['subagent-send']);
  const originalCopy = files.prepareCopy.bind(files);
  const copy = vi.spyOn(files, 'prepareCopy').mockImplementationOnce(async (file) => {
    const prepared = await originalCopy(file);
    setFeatures(['subagent-send']);
    return prepared;
  });
  await expect(send([id])).rejects.toThrow('send it attachments');
  expect(copy).not.toHaveBeenCalled();
  setFeatures(['subagent-send', 'subagent-attachments']);
  await expect(send([id])).rejects.toThrow('send it attachments');
  const { store } = rig.opened;
  expect(store.assistantEvents.pending()).toEqual([]);
  expect(
    store.assistantChat.unattachedBefore('2099-11-05T15:00:00.000Z').map((file) => file.id),
  ).toEqual([id]);
  setFeatures(['subagent-send', 'subagent-attachments']);
  const accepted = await send([id]);
  await expect(send([id])).resolves.toMatchObject({ id: accepted.id });
  expect(store.assistantEvents.pending()).toHaveLength(1);
});

it('delivers a quoted reply with ordered child file and image copies to a capable host', async () => {
  rig = await harnessRig();
  const { parent, child, files, send, setFeatures } = await directedFilesFixture(rig);
  setFeatures(['subagent-send', 'subagent-attachments']);
  const { store } = rig.opened;
  const conversation = new ConversationLog(store);
  if (child.helper_name === null) throw new Error('The fixture helper has no name.');
  const quoted = conversation.responderInChat({
    chat: parent,
    replyTo: null,
    text: 'The earlier layout is ready.',
    helperDialogue: {
      kind: 'helper_dialogue',
      direction: 'from_helper',
      helper_chat_id: child.id,
      helper_name: child.helper_name,
    },
  });
  const ids = [
    await directedUpload(rig, files, 'context.txt'),
    await directedUpload(rig, files, 'layout.png', PNG),
  ];
  const text = 'Compare it with the screenshot and notes.';
  const submitted = await send(ids, { text, quotedMessageId: quoted.id });
  expect(submitted.quote).toEqual({
    message_id: quoted.id,
    author: quoted.author,
    excerpt: 'The earlier layout is ready.',
    media_kind: null,
  });
  const [event] = store.assistantEvents.pending();
  if (typeof event?.message_id !== 'string')
    throw new Error('The directed child row was not queued.');
  const copies = store.assistantChat.attachmentsOf(event.message_id);
  expect(copies.map(({ name, mime }) => ({ name, mime }))).toEqual([
    { name: 'context.txt', mime: 'text/plain' },
    { name: 'layout.png', mime: 'image/png' },
  ]);
  expect(copies.some((file) => ids.includes(file.id))).toBe(false);
  const role = rig.owner.role;
  const service = rig.service;
  const expected = await prepareHelperContinuation(service, child, role, {
    attachments: true,
    pendingInput: () => [],
  });
  const submit = (input: typeof event): Promise<void> =>
    submitHelperContinuation(service, child, input, { role, expected });
  const reply = conversation.startReply(child, event.message_id, 'model-a');
  store.harnessDeliveries.admit(event.id, expected.child.session_id, () => reply.id);
  await expect(submit({ ...event, message_id: submitted.id })).rejects.toThrow('unavailable');
  setFeatures(['subagent-send']);
  await expect(submit(event)).rejects.toThrow('send it attachments');
  expect(rig.hub.requests).toEqual([]);
  setFeatures(['subagent-send', 'subagent-attachments']);
  await submit(event);
  expect(rig.hub.requests).toHaveLength(1);
  expect(rig.hub.requests[0]).toMatchObject({
    kind: 'prompt',
    text,
    delivery_id: event.id,
    attachments: copies.map((file) => file.id),
    helper_parent: { session_id: expected.parent.session_id, quote: quoted.text },
  });
});
