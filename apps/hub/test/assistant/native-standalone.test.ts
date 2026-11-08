import { mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import {
  DEFAULT_CODEX_AI_SETTINGS,
  ENGINE,
  NATIVE_DEFAULT_MODEL,
  DEFAULT_COMPUTER_AI_SETTINGS,
  PROVIDER_TURN_MAX_BYTES,
  type ComputerAiRuntime,
  type AiChatRow,
  type ComputerRuntimeCapabilities,
  type ComputerRuntimeModel,
  type ComputerRuntimeReply,
  type ComputerRuntimeTarget,
  type CodexProviderEvent,
  type CodexProviderTurn,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantService } from '../../src/assistant/service';
import type { ChatOwner } from '../../src/assistant/chat-directory';
import { ComputerAiDirectory } from '../../src/computers/ai-directory';
import { unavailableRuntime } from '../../src/computers/runtime-status';
import type {
  ComputerRuntimeHost,
  ComputerRuntimeHostEvent,
} from '../../src/computers/runtime-host';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';
import {
  attachClaudeNativeHost,
  CLAUDE_NATIVE_PROMPT,
  CLAUDE_NATIVE_SESSION,
} from '../support/claude-native-host';
import { hubLayout } from '../../src/data-layout';

const MODEL = 'codex-test';
const SESSION = 'session-from-selected-computer';
const READY: ComputerRuntimeCapabilities = {
  ...unavailableRuntime('codex'),
  operations: ['provider_start'],
  provider_reason: null,
  authentication: 'chatgpt',
  subscription: 'eligible',
};

let opened: TestStore;
let owner: ChatOwner;
let clientId: string;
let service: AssistantService;
let directory: ComputerAiDirectory;
let target: ComputerRuntimeTarget;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  const { store } = opened;
  const client = store.clients.create(
    { name: 'Paired computer', platform: 'desktop', role: 'owner', tokenHash: 'test' },
    true,
  );
  clientId = client.id;
  owner = { profileId: store.profiles.activeOf(clientId).id, role: 'owner' };
  directory = new ComputerAiDirectory(store, testLogger('computer'));
  service = new AssistantService({
    store,
    layout: hubLayout(opened.directory, {}),
    announce: (): void => undefined,
    emit: (): void => undefined,
    now: (): Date => new Date(),
    log: testLogger('assistant'),
  });
  service.attachComputerAi(directory);
  target = { device_id: computer(), runtime: 'codex' };
  store.computerRuntimes.saveSettings(target, {
    runtime: 'codex',
    settings: {
      ...DEFAULT_CODEX_AI_SETTINGS,
      provider: {
        ...DEFAULT_CODEX_AI_SETTINGS.provider,
        enabled: true,
        options: { cwd: '/home/test/work' },
      },
    },
  });
  store.computerRuntimes.cache(target, READY, [model()]);
});

afterEach(async () => {
  service.stop();
  directory.stop();
  await opened.close();
});

function computer(): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'computer:test',
      parentId: null,
      kind: 'computer',
      name: 'Supplying computer',
      model: 'smarteverything.computer',
      manufacturer: 'Linux',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('Missing test computer.');
  return row.id;
}

function model(): ComputerRuntimeModel {
  return {
    ...target,
    id: MODEL,
    resolved_model: null,
    name: 'Test Codex',
    description: '',
    efforts: [],
    adaptive_thinking: false,
    fast: false,
    input_modalities: ['text', 'image'],
    available: true,
    reason: null,
  };
}

function nativeEngine(cwd?: string): Extract<AiChatRow['engine'], { kind: 'codex' }> {
  return {
    kind: 'codex',
    device_id: target.device_id,
    model: MODEL,
    effort: null,
    settings: cwd === undefined ? {} : { cwd },
  };
}

function finishCodex(
  send: (event: ComputerRuntimeHostEvent) => void,
  turn: CodexProviderTurn,
  generation: string,
  staleGeneration: string | undefined,
): void {
  const base = {
    job_id: turn.job_id,
    chat_id: turn.chat_id,
    process_generation: generation,
    thread_id: SESSION,
    turn_id: null,
    item_id: null,
  };
  const emit = (event: CodexProviderEvent): void => {
    send({ kind: 'provider', runtime: 'codex', event });
  };
  emit({ ...base, seq: 1, kind: 'accepted', session_id: SESSION });
  emit({
    ...base,
    seq: 2,
    kind: 'context',
    context: {
      runtime: 'codex',
      device_id: turn.device_id,
      session_id: SESSION,
      process_generation: generation,
      cwd: '/home/test/work',
    },
  });
  if (staleGeneration !== undefined)
    emit({
      ...base,
      seq: 3,
      process_generation: staleGeneration,
      kind: 'text',
      delta: 'Stale text',
    });
  emit({
    ...base,
    seq: 3,
    kind: 'tool_call',
    call_id: 'read-work',
    name: 'read',
    input: {},
    origin: 'computer',
  });
  emit({ ...base, seq: 4, kind: 'text', delta: 'Reply from Codex' });
  emit({ ...base, seq: 5, kind: 'completed', session_id: SESSION, interrupted: false });
}

function attach(
  capabilities = READY,
  generation = randomUUID(),
  staleGeneration?: string,
): ReturnType<typeof vi.fn<ComputerRuntimeHost['execute']>> {
  let send: (event: ComputerRuntimeHostEvent) => void = (): void => undefined;
  const execute = vi.fn(
    (input: Parameters<ComputerRuntimeHost['execute']>[0]): Promise<ComputerRuntimeReply> => {
      if (input.runtime !== 'codex' || input.request.operation !== 'provider_start')
        throw new Error('Unexpected native operation.');
      const { job_id } = input.request.turn;
      finishCodex(send, input.request.turn, generation, staleGeneration);
      return Promise.resolve({
        runtime: 'codex',
        reply: { operation: 'provider_start', value: { job_id, session_id: SESSION } },
      });
    },
  );
  directory.attachRuntime(
    target,
    {
      runtime: 'codex',
      execute,
      read: (): Promise<never> => Promise.reject(new Error('Unexpected native read.')),
      onEvent: (listener) => {
        send = listener;
        listener({ kind: 'capabilities', runtime: 'codex', capabilities });
        return (): void => undefined;
      },
      stop: (): void => undefined,
    },
    false,
  );
  return execute;
}

function attachImageHelper(runtime: ComputerAiRuntime): {
  readonly engine: AiChatRow['engine'];
  readonly starts: () => number;
} {
  if (runtime === 'codex') {
    const execute = attach();
    return { engine: nativeEngine(), starts: () => execute.mock.calls.length };
  }
  const { store } = opened;
  const deviceId = target.device_id;
  const engine = { ...CLAUDE_TEST_ENGINE, device_id: deviceId };
  store.computerAi.saveSettings(deviceId, {
    ...DEFAULT_COMPUTER_AI_SETTINGS,
    provider: { enabled: true, options: { cwd: '/home/test/claude', builtin_tools: [] } },
  });
  store.computerRuntimes.cache(
    { device_id: deviceId, runtime },
    { ...unavailableRuntime(runtime), operations: ['provider_start'] },
    [{ ...model(), runtime, id: engine.model }],
  );
  const host = attachClaudeNativeHost(directory, deviceId);
  return { engine, starts: () => host.execute.mock.calls.length };
}

async function boundaryImageUploads(): Promise<readonly string[]> {
  const { store } = opened;
  const mime = 'image/png';
  const part = { type: 'image', media_type: mime, data: '' };
  const framing = Buffer.byteLength(JSON.stringify([part, part]), 'utf8');
  const reserve = 16;
  const bytes = Math.floor((PROVIDER_TURN_MAX_BYTES - framing - reserve) / 8) * 3;
  const content = Buffer.alloc(bytes);
  const sha = createHash('sha256').update(content).digest('hex');
  return Promise.all(
    ['first.png', 'second.png'].map(async (name) => {
      const file = store.assistantChat.addAttachment({
        id: randomUUID(),
        profile_id: owner.profileId,
        name,
        mime,
        bytes,
        width: 1,
        height: 1,
        storage_path: name,
        sha256: sha,
      });
      await mkdir(dirname(service.files.pathOf(file)), { recursive: true });
      await writeFile(service.files.pathOf(file), content);
      return file.id;
    }),
  );
}

describe('standalone native chats', () => {
  it('requires explicit admission, an owner, and valid configured options', () => {
    const engine = nativeEngine();
    expect(() => service.createChat(owner, { engine })).toThrow(/when creating a new chat/);
    const ready = attach();
    expect(() => service.createChat({ ...owner, role: 'member' }, { engine }, true)).toThrow(
      /Only the home owner/,
    );
    expect(() => service.createChat(owner, { engine: nativeEngine('relative') }, true)).toThrow(
      /absolute project folder/,
    );
    opened.store.computerRuntimes.saveSettings(target, {
      runtime: 'codex',
      settings: {
        ...DEFAULT_CODEX_AI_SETTINGS,
        provider: {
          enabled: true,
          options: { cwd: '/home/test/work', service_tier: 'fast' },
        },
      },
    });
    expect(() => service.createChat(owner, { engine }, true)).toThrow(
      /has not reported the requested service tier/,
    );
    expect(ready).not.toHaveBeenCalled();
    expect(opened.store.aiChats.chats({ profileId: owner.profileId, archived: false })).toEqual([]);
  });

  it.each(['claude', 'codex'] as const)(
    'creates a %s chat when a known computer has no reported models, authentication or project',
    (kind) => {
      const device = { device_id: target.device_id, runtime: kind };
      opened.store.computerRuntimes.saveSettings(
        device,
        kind === 'claude'
          ? { runtime: kind, settings: DEFAULT_COMPUTER_AI_SETTINGS }
          : { runtime: kind, settings: DEFAULT_CODEX_AI_SETTINGS },
      );
      opened.store.computerRuntimes.cache(device, unavailableRuntime(kind), []);
      const engine = ENGINE.parse({
        kind,
        device_id: target.device_id,
        model: NATIVE_DEFAULT_MODEL,
      });
      expect(service.createChat(owner, { engine }, true)).toMatchObject({
        engine,
        native_admission: 'standalone',
      });
    },
  );

  it('records the live Codex refusal on the submitted message', async () => {
    const reason = 'Sign in to the official Codex CLI with ChatGPT on this computer.';
    const execute = attach({
      ...READY,
      provider_reason: 'Cached usage is exhausted.',
    });
    execute.mockRejectedValueOnce(new Error(reason));
    const chat = service.createChat(owner, { engine: nativeEngine() }, true);
    const sender = { clientId, profileId: owner.profileId };
    const message = service.send(sender, { text: 'Try the provider', attachments: [] }, chat.id);
    await vi.waitFor(() => {
      expect(opened.store.assistantChat.message(message.id)).toMatchObject({
        state: 'failed',
        reason,
      });
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('sends a turn to the selected computer and follows ordinary list, search and branch operations', async () => {
    const reason = 'Cached usage is exhausted.';
    const cached = { ...READY, provider_reason: reason };
    opened.store.computerRuntimes.cache(target, cached, [{ ...model(), available: false, reason }]);
    const execute = attach(cached);
    const coordinator = service.createChat(owner, { engine: TEST_ENGINE, title: 'Coordinator' });
    const engine = nativeEngine();
    const native = service.createChat(owner, { engine, title: 'Native work' }, true);
    const sender = { clientId, profileId: owner.profileId };
    const message = service.send(
      sender,
      { text: 'Do some native work', attachments: [] },
      native.id,
    );
    await vi.waitFor(() => {
      expect(opened.store.assistantChat.message(message.id).state).toBe('answered');
    });
    expect(execute).toHaveBeenCalledTimes(1);
    const request = execute.mock.calls[0]?.[0];
    if (request?.runtime !== 'codex' || request.request.operation !== 'provider_start')
      throw new Error('Expected a Codex turn.');
    expect(request.request.turn).toMatchObject({
      device_id: target.device_id,
      chat_id: native.id,
      model: MODEL,
      session_id: null,
      options: { cwd: '/home/test/work' },
    });
    expect(service.messages(native.id, undefined, 10)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'responder', text: 'Reply from Codex' }),
      ]),
    );
    expect(native).toMatchObject({ kind: 'chat', native_admission: 'standalone', memory: false });
    expect(service.chats.defaultChat(owner.profileId).id).toBe(coordinator.id);
    expect(
      service.searchChats(owner, { q: 'Reply from Codex', archived: false, limit: 10 }),
    ).toEqual([expect.objectContaining({ chatId: native.id })]);
    await expect(service.updateChat(owner, native.id, { engine: TEST_ENGINE })).rejects.toThrow(
      /keep its engine family/,
    );
    await expect(service.branchChat(owner, native.id, { messageId: message.id })).rejects.toThrow(
      /unconfined owner client/,
    );
    const branch = await service.branchChat(owner, native.id, { messageId: message.id }, true);
    expect(branch).toMatchObject({ engine, parent_id: native.id, native_admission: 'standalone' });
    await service.removeChat(owner, branch.id);
    await service.updateChat(owner, native.id, { archived: true, pinned: true });
    expect(opened.store.aiChats.chats({ profileId: owner.profileId, archived: true })).toEqual([
      expect.objectContaining({ id: native.id, pinned: true }),
    ]);
  });

  it('resumes the same Codex session after the host restarts and rejects stale process events', async () => {
    const { store } = opened;
    const oldGeneration = randomUUID();
    const newGeneration = randomUUID();
    attach(READY, oldGeneration);
    const chat = service.createChat(owner, { engine: nativeEngine() }, true);
    const sender = { clientId, profileId: owner.profileId };
    const first = service.send(sender, { text: 'Start work', attachments: [] }, chat.id);
    await vi.waitFor(() => {
      expect(store.assistantChat.message(first.id).state).toBe('answered');
    });
    expect(store.aiRuntimeProvider.read(chat.id)?.context?.process_generation).toBe(oldGeneration);

    const replacement = attach(READY, newGeneration, oldGeneration);
    const second = service.send(sender, { text: 'Continue work', attachments: [] }, chat.id);
    await vi.waitFor(() => {
      expect(store.assistantChat.message(second.id).state).toBe('answered');
    });
    const resume = replacement.mock.calls[0]?.[0];
    if (resume?.runtime !== 'codex' || resume.request.operation !== 'provider_start')
      throw new Error('Expected a Codex follow-up after restart.');
    const { job_id, session_id } = resume.request.turn;
    expect(session_id).toBe(SESSION);
    const provider = store.aiRuntimeProvider.read(chat.id);
    if (provider?.runtime !== 'codex') throw new Error('Expected the retained Codex state.');
    expect(provider.context?.process_generation).toBe(newGeneration);
    const events = provider.events.filter((event) => event.job_id === job_id);
    expect(events.map((event) => event.kind)).toEqual([
      'accepted',
      'context',
      'tool_call',
      'text',
      'completed',
    ]);
    expect(events.every((event) => event.process_generation === newGeneration)).toBe(true);
    expect(store.assistantChat.repliesTo(second.id)).toMatchObject([
      { text: 'Reply from Codex', state: 'answered' },
    ]);
  });

  it.each(['claude', 'codex'] as const)(
    'refuses %s attachments whose encoded content fits but whose provider turn exceeds transport',
    async (runtime) => {
      const { engine, starts } = attachImageHelper(runtime);
      const { store } = opened;
      const parent = service.createChat(owner, { title: 'Coordinator', engine: TEST_ENGINE });
      const child = service.createChat(owner, { title: 'Helper', engine, parent_id: parent.id });
      const attachments = await boundaryImageUploads();
      const sender = { clientId, profileId: owner.profileId };
      const copy = vi.spyOn(service.files, 'prepareCopy');
      try {
        await expect(
          service.submissions.send(
            { kind: 'client', client: store.clients.byId(clientId) },
            sender,
            {
              text: '',
              attachments: [...attachments],
              client_message_id: randomUUID(),
              helper_target: { chat_id: child.id },
            },
            parent.id,
          ),
        ).rejects.toThrow('transport limit');
        expect(copy).not.toHaveBeenCalled();
        expect(store.assistantChat.messageIdsOf(parent.id)).toEqual([]);
        expect(store.assistantChat.messageIdsOf(child.id)).toEqual([]);
        expect(store.assistantEvents.pending()).toEqual([]);
        expect(starts()).toBe(0);
        for (const id of attachments)
          expect(store.assistantChat.attachment(id).message_id).toBeNull();
      } finally {
        copy.mockRestore();
      }
    },
  );

  it.each([
    { revocation: 'parent message deletion', reason: 'removed' },
    { revocation: 'machine sandbox change', reason: 'machine settings changed' },
  ])(
    'blocks a helper start after $revocation during attachment preparation',
    async ({ revocation, reason }) => {
      const execute = attach();
      const { store } = opened;
      const defaults = store.computerRuntimes.settings(target);
      if (defaults.runtime !== 'codex') throw new Error('Expected Codex machine defaults.');
      const provider = defaults.settings.provider;
      store.computerRuntimes.saveSettings(target, {
        runtime: 'codex',
        settings: {
          ...defaults.settings,
          provider: {
            ...provider,
            options: { ...provider.options, sandbox_policy: { type: 'dangerFullAccess' } },
          },
        },
      });
      const parent = service.createChat(owner, { title: 'Coordinator', engine: TEST_ENGINE });
      const child = service.createChat(owner, {
        title: 'Helper',
        engine: nativeEngine(),
        parent_id: parent.id,
      });
      const sender = { clientId, profileId: owner.profileId };
      const contents = Buffer.from('Previous input');
      const file = store.assistantChat.addAttachment({
        id: randomUUID(),
        profile_id: owner.profileId,
        name: 'prior.txt',
        mime: 'text/plain',
        bytes: contents.length,
        width: null,
        height: null,
        storage_path: 'prior.txt',
        sha256: createHash('sha256').update(contents).digest('hex'),
      });
      await mkdir(dirname(service.files.pathOf(file)), { recursive: true });
      await writeFile(service.files.pathOf(file), contents);
      const conversation = new ConversationLog(store);
      const prior = conversation.person({
        chat: child,
        clientId,
        author: 'Owner',
        text: 'Prior question',
        files: [file],
        origin: { source: 'app', plugin_id: null, device_id: null, name: null },
      });
      conversation.stateOf(prior.id, 'answered');
      const key = randomUUID();
      const pathOf = service.files.pathOf.bind(service.files);
      const stagedRead = vi.spyOn(service.files, 'pathOf').mockImplementationOnce((file) => {
        const row = store.assistantSearch.byClientMessageId(parent.id, key);
        if (row === undefined)
          throw new Error('Expected accepted parent message during preparation.');
        queueMicrotask(() => {
          if (revocation === 'parent message deletion') {
            store.assistantChat.removeMessages([row.id]);
            return;
          }
          store.computerRuntimes.saveSettings(target, {
            runtime: 'codex',
            settings: {
              ...defaults.settings,
              provider: {
                ...provider,
                options: {
                  ...provider.options,
                  sandbox_policy: { type: 'readOnly', networkAccess: false },
                },
              },
            },
          });
        });
        return pathOf(file);
      });
      await service.submissions.send(
        { kind: 'client', client: store.clients.byId(clientId) },
        sender,
        {
          text: 'A directed turn',
          attachments: [],
          client_message_id: key,
          helper_target: { chat_id: child.id },
        },
        parent.id,
      );
      await vi.waitFor(() => {
        const current = store.assistantChat.latestPersonText(child.id);
        expect(current).toMatchObject({
          text: 'A directed turn',
          state: 'failed',
        });
        expect(current?.reason).toContain(reason);
      });
      expect(stagedRead).toHaveBeenCalledTimes(1);
      expect(execute).not.toHaveBeenCalled();
      stagedRead.mockRestore();
    },
  );

  it('refuses generic retry for a failed parent message and editing its settled child copy', async () => {
    const execute = attach();
    const { store } = opened;
    const parent = service.createChat(owner, { title: 'Coordinator', engine: TEST_ENGINE });
    const child = service.createChat(owner, {
      title: 'Helper',
      engine: nativeEngine(),
      parent_id: parent.id,
    });
    const row = await service.submissions.send(
      { kind: 'client', client: store.clients.byId(clientId) },
      {
        clientId,
        profileId: owner.profileId,
      },
      {
        text: 'Directed question',
        attachments: [],
        client_message_id: randomUUID(),
        helper_target: { chat_id: child.id },
      },
      parent.id,
    );
    await vi.waitFor(() => {
      expect(store.assistantChat.message(row.id).state).toBe('answered');
    });
    const asked = store.assistantChat.latestPersonText(child.id);
    if (asked === undefined) throw new Error('Expected the settled child input.');
    expect(asked.state).toBe('answered');
    store.assistantChat.updateMessage(row.id, { state: 'failed' });
    await expect(
      service.retry(owner, { chatId: parent.id, messageId: row.id }, 'failed'),
    ).rejects.toThrow('from the parent chat');
    await expect(
      service.edit(owner, { chatId: child.id, messageId: asked.id }, { text: 'Replace it' }),
    ).rejects.toThrow('from the parent chat');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('starts an explicit Claude chat, forwards its permission answer and resumes the native session', async () => {
    const deviceId = target.device_id;
    const engine = {
      ...CLAUDE_TEST_ENGINE,
      device_id: deviceId,
      settings: { builtin_tools: ['Bash'] },
    };
    const { store } = opened;
    store.computerAi.saveSettings(deviceId, {
      ...DEFAULT_COMPUTER_AI_SETTINGS,
      provider: { enabled: true, options: { builtin_tools: ['Bash'], cwd: '/home/test/claude' } },
    });
    store.computerRuntimes.cache(
      { device_id: deviceId, runtime: 'claude' },
      {
        ...unavailableRuntime('claude'),
        operations: ['provider_start', 'provider_answer'],
      },
      [{ ...model(), runtime: 'claude', id: engine.model }],
    );
    const host = attachClaudeNativeHost(directory, deviceId);
    const runner = service.computerProviders.get('claude');
    if (runner === undefined) throw new Error('Expected a Claude runner.');

    const native = service.createChat(owner, { engine, title: 'Claude work' }, true);
    expect(native).toMatchObject({ kind: 'chat', native_admission: 'standalone', engine });
    const sender = { clientId, profileId: owner.profileId };
    const first = service.send(
      sender,
      { text: 'Check the project folder', attachments: [] },
      native.id,
    );
    await vi.waitFor(() => {
      expect(runner.state.read(native).prompts).toMatchObject([
        { id: CLAUDE_NATIVE_PROMPT, kind: 'permission', status: 'pending' },
      ]);
    });
    const start = host.execute.mock.calls[0]?.[0];
    if (start?.operation !== 'provider_start') throw new Error('Expected a Claude start.');
    expect(start.turn).toMatchObject({
      chat_id: native.id,
      device_id: deviceId,
      model: engine.model,
      session_id: null,
      options: { cwd: '/home/test/claude', builtin_tools: ['Bash'] },
    });
    expect(store.assistantChat.message(first.id).state).toBe('working');
    await runner.state.answer(native, CLAUDE_NATIVE_PROMPT, { decision: 'allow' });
    expect(host.execute.mock.calls[1]?.[0]).toEqual({
      operation: 'provider_answer',
      job_id: start.turn.job_id,
      prompt_id: CLAUDE_NATIVE_PROMPT,
      answer: { decision: 'allow' },
    });
    expect(runner.state.read(native).prompts).toMatchObject([{ status: 'answered' }]);
    await expect(
      runner.state.answer(native, CLAUDE_NATIVE_PROMPT, { decision: 'allow' }),
    ).rejects.toThrow(/no longer pending/);
    expect(host.execute).toHaveBeenCalledTimes(2);
    host.finish(start.turn, 'The project folder is ready.');
    expect(store.assistantChat.message(first.id).state).toBe('answered');

    const followup = service.send(sender, { text: 'Keep going', attachments: [] }, native.id);
    await vi.waitFor(() => {
      expect(host.execute).toHaveBeenCalledTimes(3);
    });
    const resume = host.execute.mock.calls[2]?.[0];
    if (resume?.operation !== 'provider_start') throw new Error('Expected a Claude follow-up.');
    expect(resume.turn.session_id).toBe(CLAUDE_NATIVE_SESSION);
    expect(resume.turn.job_id).not.toBe(start.turn.job_id);
    expect(resume.turn.messages.map((message) => message.role)).toEqual(['user']);
    expect(resume.turn.messages[0]?.content[0]).toEqual({ type: 'text', text: 'Keep going' });
    host.finish(resume.turn, 'Continued in the same session.');
    expect(store.assistantChat.message(followup.id).state).toBe('answered');
    expect(store.assistantChat.repliesTo(followup.id)).toMatchObject([
      { text: 'Continued in the same session.', state: 'answered' },
    ]);
  });

  it('keeps exact reads of the legacy root and descendants while refusing their mutation', async () => {
    const { aiChats } = opened.store;
    const retired = aiChats.create({
      profileId: owner.profileId,
      kind: 'chat',
      title: 'Native history',
      nativeAdmission: 'retired',
      icon: null,
      parentId: null,
      sourceKey: null,
      engine: CLAUDE_TEST_ENGINE,
    });
    const child = aiChats.create({
      profileId: owner.profileId,
      kind: 'subagent',
      title: 'Native history helper',
      nativeAdmission: 'retired',
      icon: null,
      parentId: retired.id,
      sourceKey: null,
      engine: TEST_ENGINE,
    });

    for (const chat of [retired, child]) {
      expect(service.chats.own(owner, chat.id)).toMatchObject({ native_admission: 'retired' });
      expect(() => {
        aiChats.assertWorkAllowed(chat.id);
      }).toThrow(/read-only/);
      expect(() => {
        aiChats.assertWorkAllowed(chat.id, 'read');
      }).not.toThrow();
      await expect(service.updateChat(owner, chat.id, { pinned: true })).rejects.toThrow(
        /read-only/,
      );
      await expect(service.removeChat(owner, chat.id)).rejects.toThrow(/read-only/);
      expect(() =>
        service.send(
          { clientId, profileId: owner.profileId },
          { text: 'Resume', attachments: [] },
          chat.id,
        ),
      ).toThrow(/read-only/);
    }
    expect(aiChats.chats({ profileId: owner.profileId, archived: false })).toEqual([]);
    expect(service.searchChats(owner, { q: 'Native history', archived: false, limit: 10 })).toEqual(
      [],
    );
  });
});
