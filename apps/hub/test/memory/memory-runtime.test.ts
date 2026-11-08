import { remember } from '../support/memory-service';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm';
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session';
import { DSH_SESSION_ID, type DshWriterClaim } from '@smarteverything/domain';
import { createHarnessRuntime } from '@smarteverything/harness';
import type { HarnessRuntime, HarnessRuntimeEvent } from '@smarteverything/harness';
import type { ToolCaller } from '../../src/ai-tools/hub-tool';
import { bindHubMemory } from '../../src/memory/binding';
import { MemoryService } from '../../src/memory/service';
import { FakeMemoryEmbedder } from '../support/memory-embedder';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const PROVIDER = 'scripted';
const MODEL = 'scripted-model';

type Reply =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'tool';
      readonly id: string;
      readonly name: string;
      readonly input: Readonly<Record<string, unknown>>;
    };

class ScriptedModel extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];
  private readonly replies: Reply[] = [];

  script(...replies: readonly Reply[]): void {
    this.replies.push(...replies);
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider, id: MODEL, name: MODEL }]);
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      context: { contextWindow: 200_000 },
    });
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    await Promise.resolve();
    this.requests.push(options);
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error('The scripted model has no reply left.');
    yield* chunks(reply);
  }
}

function chunks(reply: Reply): readonly StreamChunk[] {
  const usage: StreamChunk = { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } };
  if (reply.kind === 'text')
    return [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: reply.text },
      { type: 'block-end', index: 0, block: { type: 'text', text: reply.text } },
      usage,
      { type: 'finish', reason: { kind: 'stop' } },
    ];
  const id = ToolCallId(reply.id);
  const args = JSON.stringify(reply.input);
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: reply.name, argumentsDelta: args },
    {
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id, name: reply.name, arguments: args },
    },
    usage,
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ];
}

class Persistence {
  readonly sessions = new Map<string, { header: SessionHeader; events: SessionEvent[] }>();
  private epoch = 0;
  private readonly device = randomUUID();

  create(header: SessionHeader): Promise<ReturnType<Persistence['writer']>> {
    this.sessions.set(header.id, { header, events: [] });
    return Promise.resolve(this.writer(header.id));
  }

  acquire(id: SessionId): Promise<ReturnType<Persistence['writer']>> {
    return Promise.resolve(this.writer(id));
  }

  stat(id: SessionId): Promise<ReturnType<Persistence['snapshot']> | undefined> {
    return Promise.resolve(this.sessions.has(id) ? this.snapshot(id) : undefined);
  }

  list(): Promise<readonly ReturnType<Persistence['snapshot']>[]> {
    return Promise.resolve([...this.sessions.keys()].map((id) => this.snapshot(id)));
  }

  read(id: SessionId): Promise<unknown> {
    return Promise.resolve(structuredClone(this.stored(id).events));
  }

  append(
    claim: DshWriterClaim,
    _operation: string,
    events: readonly SessionEvent[],
  ): Promise<void> {
    this.stored(SessionId(claim.session_id)).events.push(...structuredClone(events));
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  onOwnershipLost(): () => void {
    return (): void => undefined;
  }

  private stored(id: string): { header: SessionHeader; events: SessionEvent[] } {
    const stored = this.sessions.get(id);
    if (stored === undefined) throw new Error(`Unknown session ${id}.`);
    return stored;
  }

  private snapshot(id: string): {
    header: SessionHeader;
    inheritedEventCount: number;
    eventCount: number;
    revision: string;
  } {
    const stored = this.stored(id);
    return {
      header: structuredClone(stored.header),
      inheritedEventCount: 0,
      eventCount: stored.events.length,
      revision: `revision-${String(stored.events.length)}`,
    };
  }

  private writer(id: string): ReturnType<Persistence['snapshot']> & { claim: DshWriterClaim } {
    this.epoch += 1;
    return {
      ...this.snapshot(id),
      claim: {
        session_id: DSH_SESSION_ID.parse(id),
        target: { kind: 'device', device_id: this.device },
        runtime_instance: randomUUID(),
        connection_generation: randomUUID(),
        epoch: this.epoch,
      },
    };
  }
}

interface Rig {
  readonly runtime: HarnessRuntime;
  readonly model: ScriptedModel;
  readonly events: HarnessRuntimeEvent[];
  readonly workspace: string;
  readonly directory: string;
}

let opened: TestStore;
let rig: Rig | undefined;
let callers: Map<string, ToolCaller>;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  callers = new Map();
});

afterEach(async () => {
  if (rig !== undefined) {
    await rig.runtime.dispose();
    await rm(rig.directory, { recursive: true, force: true });
    rig = undefined;
  }
  await opened.close();
});

async function boot(): Promise<Rig> {
  const directory = await mkdtemp(join(tmpdir(), 'memory-runtime-'));
  const workspace = join(directory, 'home');
  await mkdir(workspace);
  const model = new ScriptedModel();
  const events: HarnessRuntimeEvent[] = [];
  const runtime = await createHarnessRuntime({
    host: {
      target: { kind: 'device', device_id: randomUUID() },
      name: 'Test machine',
      platform: 'linux',
      homeDirectory: workspace,
      stateDirectory: join(directory, 'state'),
    },
    persistence: new Persistence(),
    interactions: {
      approve: () => Promise.resolve('allowed-once'),
      question: () => Promise.reject(new Error('No questions in this test.')),
    },
    desiredConfiguration: { revision: 'test-empty', entries: [] },
    installedPlugins: [],
    apiKeys: {
      source: 'test-vault',
      read: () => Promise.resolve(undefined),
      write: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      watch: () => (): void => undefined,
    },
    configurationChanged: (): void => undefined,
    onEvent: (event) => {
      events.push(event);
    },
    installModelRoutes: async (ctx) => {
      await ctx.inject(['llm', 'tools'], (active): void => {
        const registration = active.llm.registerAdapter([PROVIDER], model);
        active.effect(() => registration);
        active.effect(() =>
          bindHubMemory(
            active,
            opened.store,
            {
              caller: (sessionId) => {
                const caller = callers.get(sessionId);
                if (caller === undefined) throw new Error(`No grant for session ${sessionId}.`);
                return caller;
              },
            },
            new MemoryService(
              opened.store.aiMemories,
              opened.store.aiChats,
              new FakeMemoryEmbedder(),
            ),
          ),
        );
      });
    },
  });
  rig = { runtime, model, events, workspace, directory };
  return rig;
}

function person(name: string, role: ToolCaller['role']): { id: string; session: string } {
  const profile = opened.store.profiles.create({ name });
  const session = randomUUID();
  callers.set(session, { profileId: profile.id, role, chatId: null, via: 'chat', clientId: null });
  return { id: profile.id, session };
}

async function asked(host: Rig, session: string, turns: number): Promise<void> {
  const open = await host.runtime.create({
    sessionId: session,
    provider: PROVIDER,
    model: MODEL,
    directory: host.workspace,
  });
  open.text('hello');
  await vi.waitFor(() => {
    const idle = host.events.filter((event) => event.kind === 'status' && event.status === 'idle');
    expect(idle).toHaveLength(turns);
  });
  await open.flush();
}

function request(host: Rig, index: number): string {
  return JSON.stringify(host.model.requests[index]?.messages ?? []);
}

describe('the memory plugin wired the way the hub wires it', () => {
  it('shows a new session only the notes of the person it belongs to', async () => {
    const host = await boot();
    const ida = person('Ida', 'member');
    const kid = person('Kid', 'member');
    const service = new MemoryService(
      opened.store.aiMemories,
      opened.store.aiChats,
      new FakeMemoryEmbedder(),
    );
    await remember(
      service,
      { profileId: ida.id, role: 'member', chatId: null, messageId: null },
      { scope: 'person', text: 'Ida takes the 7:40 bus' },
    );
    host.model.script({ kind: 'text', text: 'one' }, { kind: 'text', text: 'two' });

    await asked(host, ida.session, 1);
    await asked(host, kid.session, 2);

    expect(request(host, 0)).toContain('Ida takes the 7:40 bus');
    expect(request(host, 1)).not.toContain('7:40');
    expect(host.model.requests[0]?.tools?.map((tool) => tool.name)).toContain('memory');
  });

  it('saves the note the model adds for the person of the session and refuses a profile the model names', async () => {
    const host = await boot();
    const ida = person('Ida', 'member');
    const kid = person('Kid', 'member');
    host.model.script(
      {
        kind: 'tool',
        id: 'c1',
        name: 'memory',
        input: { action: 'add', scope: 'person', text: 'Kid hates peas' },
      },
      {
        kind: 'tool',
        id: 'c2',
        name: 'memory',
        input: { action: 'add', scope: 'person', text: 'Ida hates peas too', profile_id: ida.id },
      },
      { kind: 'text', text: 'saved' },
    );

    await asked(host, kid.session, 1);

    const texts = (profileId: string): string[] =>
      opened.store.aiMemories.visible(profileId).map((memory) => memory.text);
    expect(texts(kid.id)).toStrictEqual(['Kid hates peas']);
    expect(texts(ida.id)).toStrictEqual([]);
  });

  it('offers no tool and shows no notes to a person who turned memory off', async () => {
    const host = await boot();
    const ida = person('Ida', 'member');
    const service = new MemoryService(
      opened.store.aiMemories,
      opened.store.aiChats,
      new FakeMemoryEmbedder(),
    );
    const who = { profileId: ida.id, role: 'member' as const, chatId: null, messageId: null };
    await remember(service, who, { scope: 'person', text: 'Ida takes the 7:40 bus' });
    service.changeSettings(who, { enabled: false });
    host.model.script({ kind: 'text', text: 'one' });

    await asked(host, ida.session, 1);

    expect(request(host, 0)).not.toContain('7:40');
    expect(host.model.requests[0]?.tools?.map((tool) => tool.name)).not.toContain('memory');
  });
});
