import { expect, vi } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session';
import {
  AI_HARNESS_SESSION,
  DSH_SESSION_HEADER,
  DSH_SESSION_ID,
  DSH_SESSION_METADATA,
  type DshSessionId,
  type AiHarnessEvent,
  type AiHarnessInteraction,
  type AiHarnessSession,
  type HarnessNativeFrame,
  type AiModelRoute,
  type AiModelRouteSelection,
  type DshSessionMetadata,
  type DshWriterClaim,
  type HarnessRuntimeReceipt,
  type HarnessRuntimeRequest,
} from '@smarteverything/domain';
import { nativeHeader } from '../../src/persistence/validation';
import { HarnessReducer } from '../../src/reducer';
import type { SessionOpening } from '../../src/reducer';
import { createHarnessDispatcher } from '../../src/process/dispatcher';
import type { HarnessDispatcher } from '../../src/process/dispatcher';
import type { HarnessDispatcherOptions } from '../../src/process/dispatcher-options';
import type { HarnessControlPersistence } from '../../src/process/contracts';
import { MemoryPersistence, StoredSession } from './memory-persistence';
import { ScriptedModel } from './scripted-model';
import { EMPTY_CONFIGURATION } from './runtime';

export class ControlPersistence extends MemoryPersistence implements HarnessControlPersistence {
  private readonly bound = new Map<string, DshWriterClaim>();
  private readonly chats = new Map<string, string>();
  readonly profile = randomUUID();
  appended: (id: string, events: readonly SessionEvent[]) => void = () => undefined;

  constructor(private readonly target: DshWriterClaim['target']) {
    super();
  }

  override async append(
    claim: DshWriterClaim,
    operationId: string,
    events: readonly SessionEvent[],
  ): Promise<void> {
    await super.append(claim, operationId, events);
    this.appended(claim.session_id, events);
  }

  admit(header: SessionHeader, chatId: string): DshWriterClaim {
    const stored = new StoredSession(header, 0);
    this.sessions.set(header.id, stored);
    this.chats.set(header.id, chatId);
    return stored.claimFor(this.target);
  }

  bind(claim: DshWriterClaim): void {
    this.bound.set(claim.session_id, claim);
  }

  readmit(id: string): DshWriterClaim {
    return this.stored(SessionId(id)).claimFor(this.target);
  }

  boundClaim(id: string): DshWriterClaim | undefined {
    return this.bound.get(id);
  }

  claim(id: string): DshWriterClaim {
    const claim = this.bound.get(id);
    if (claim === undefined) throw new Error(`Session ${id} has no bound claim.`);
    return claim;
  }

  metadata(id: string): Promise<DshSessionMetadata> {
    return Promise.resolve(this.statSync(id));
  }

  statSync(id: string): DshSessionMetadata {
    const stored = this.stored(SessionId(id));
    const chat = this.chats.get(id);
    if (chat === undefined) throw new Error(`Unknown chat for session ${id}.`);
    return DSH_SESSION_METADATA.parse({
      chat_id: chat,
      profile_id: this.profile,
      header: DSH_SESSION_HEADER.parse(stored.header),
      inherited_event_count: 0,
      next_seq: stored.events.length,
      durable_seq: stored.events.length - 1,
    });
  }

  history(id: string): readonly unknown[] {
    return structuredClone(this.stored(SessionId(id)).events);
  }

  verify(claim: DshWriterClaim): Promise<DshWriterClaim> {
    return Promise.resolve(claim);
  }

  lose(id: string): void {
    this.loseOwnership(id);
  }

  override acquire(id: SessionId): ReturnType<MemoryPersistence['acquire']> {
    return Promise.resolve({ ...this.stored(id).snapshot(), claim: this.claim(id) });
  }
}

type HarnessOpen = Extract<HarnessRuntimeRequest, { kind: 'open' }>;

export interface Opened {
  readonly sessionId: DshSessionId;
  readonly chatId: string;
  readonly claim: DshWriterClaim;
}

const ROUTE_ID = randomUUID();
const FULL_ACCESS = { sandbox: 'danger-full-access', approval: 'never' } as const;

function modelRoute(profile: string): AiModelRoute {
  return {
    id: ROUTE_ID,
    profile_id: profile,
    supplier: { kind: 'server' },
    subscriber_id: profile,
    auth: { provider: 'openrouter', kind: 'hub-api-key' },
    billing: 'metered',
    fallback: 'none',
    background_authorized: true,
    capability_revision: 'caps-1',
    state: 'ready',
    models: [
      {
        id: 'scripted-model',
        name: 'Scripted',
        capabilities: {
          revision: 'caps-1',
          input_modalities: ['text'],
          output_modalities: ['text'],
          reasoning: false,
          efforts: [],
          local_tools: true,
          context_tokens: 200_000,
          discovered_at: '2026-10-08T09:00:00.000Z',
        },
      },
    ],
  };
}

interface Booted {
  readonly dispatcher: HarnessDispatcher;
  readonly persistence: ControlPersistence;
  readonly model: ScriptedModel;
  readonly published: AiHarnessEvent[];
  readonly frames: HarnessNativeFrame[];
  readonly openings: Map<string, AiHarnessSession>;
  readonly directory: string;
  readonly workspace: string;
}

export interface DispatcherExtras extends Pick<HarnessDispatcherOptions, 'describeImage'> {
  readonly intercept?: (frame: HarnessNativeFrame) => void;
}

function hubReducer(
  persistence: ControlPersistence,
  openings: ReadonlyMap<string, AiHarnessSession>,
): HarnessReducer {
  return new HarnessReducer({
    metadata: (id): DshSessionMetadata => persistence.statSync(id),
    opening: (id): SessionOpening => {
      const session = openings.get(id);
      if (session === undefined) throw new Error(`Session ${id} was not admitted by the test hub.`);
      return { session, history: persistence.history(id) };
    },
  });
}

async function boot(
  target: DshWriterClaim['target'],
  install?: (ctx: Context, persistence: ControlPersistence) => Promise<void>,
  extras: DispatcherExtras = {},
): Promise<Booted> {
  const directory = await mkdtemp(join(tmpdir(), 'dispatcher-test-'));
  const workspace = join(directory, 'home');
  await mkdir(workspace);
  const persistence = new ControlPersistence(target);
  const published: AiHarnessEvent[] = [];
  const frames: HarnessNativeFrame[] = [];
  const openings = new Map<string, AiHarnessSession>();
  const reducer = hubReducer(persistence, openings);
  persistence.appended = (id, events): void => {
    for (const event of events) published.push(...reducer.append(id, event));
  };
  const model = new ScriptedModel();
  const dispatcher = await createHarnessDispatcher({
    host: {
      target,
      name: 'Test machine',
      platform: 'linux',
      homeDirectory: workspace,
      stateDirectory: join(directory, 'state'),
    },
    desiredConfiguration: EMPTY_CONFIGURATION,
    installedPlugins: [],
    configurationChanged: () => undefined,
    persistence,
    installModelRoutes: async (ctx: Context): Promise<void> => {
      await ctx.inject(['llm'], (active: Context): void => {
        const registration = active.llm.registerAdapter([ROUTE_ID], model);
        active.effect(() => registration);
      });
      await install?.(ctx, persistence);
    },
    publish: (frame) => {
      extras.intercept?.(frame);
      frames.push(frame);
      published.push(...reducer.apply(frame));
      return Promise.resolve();
    },
    route: () => modelRoute(persistence.profile),
    authority: () => ({ kind: 'manual', profileId: persistence.profile }),
    ...(extras.describeImage === undefined ? {} : { describeImage: extras.describeImage }),
  });
  return { dispatcher, persistence, model, published, frames, openings, directory, workspace };
}

export class DispatcherFixture {
  readonly route: AiModelRouteSelection = {
    route_id: ROUTE_ID,
    capability_revision: 'caps-1',
    model: 'scripted-model',
    effort: null,
  };

  private constructor(private readonly parts: Booted) {}

  static async boot(
    target: DshWriterClaim['target'],
    install?: (ctx: Context, persistence: ControlPersistence) => Promise<void>,
    extras?: DispatcherExtras,
  ): Promise<DispatcherFixture> {
    return new DispatcherFixture(await boot(target, install, extras));
  }

  get dispatcher(): HarnessDispatcher {
    return this.parts.dispatcher;
  }

  get persistence(): ControlPersistence {
    return this.parts.persistence;
  }

  get model(): ScriptedModel {
    return this.parts.model;
  }

  get published(): AiHarnessEvent[] {
    return this.parts.published;
  }

  get frames(): HarnessNativeFrame[] {
    return this.parts.frames;
  }

  get directory(): string {
    return this.parts.directory;
  }

  async open(permission: HarnessOpen['permission'] = FULL_ACCESS): Promise<Opened> {
    const sessionId = DSH_SESSION_ID.parse(randomUUID());
    const chatId = randomUUID();
    const claim = this.parts.persistence.admit(
      nativeHeader({
        version: 4,
        id: sessionId,
        createdAt: Date.now(),
        cwd: join(this.parts.directory, 'home'),
        isSeeded: false,
        agentPreset: 'smarteverything',
      }),
      chatId,
    );
    const cwd = join(this.parts.directory, 'home');
    this.parts.openings.set(
      sessionId,
      AI_HARNESS_SESSION.parse({
        chat_id: chatId,
        session_id: sessionId,
        metadata: this.parts.persistence.statSync(sessionId),
        target: claim.target,
        epoch: claim.epoch,
        directory: { target: claim.target, path: cwd },
        permission,
        route: this.route,
        state: 'idle',
        interactions: [],
        work: [],
        failure: null,
      }),
    );
    await this.parts.dispatcher.execute(randomUUID(), {
      kind: 'open',
      chat_id: chatId,
      claim,
      route: this.route,
      permission,
      cwd,
      mode: 'create',
    });
    return { sessionId, chatId, claim };
  }

  async reattach(
    opened: Opened,
    interactions: readonly AiHarnessInteraction[] = [],
  ): Promise<Opened> {
    const claim = this.parts.persistence.readmit(opened.sessionId);
    const prior = this.parts.openings.get(opened.sessionId);
    if (prior !== undefined)
      this.parts.openings.set(
        opened.sessionId,
        AI_HARNESS_SESSION.parse({ ...prior, epoch: claim.epoch }),
      );
    await this.parts.dispatcher.execute(randomUUID(), {
      kind: 'open',
      chat_id: opened.chatId,
      claim,
      route: this.route,
      permission: FULL_ACCESS,
      cwd: join(this.parts.directory, 'home'),
      mode: 'resume',
      ...(interactions.length === 0 ? {} : { interactions: [...interactions] }),
    });
    return { ...opened, claim };
  }

  send(opened: Opened, text: string): Promise<HarnessRuntimeReceipt> {
    return this.parts.dispatcher.execute(randomUUID(), {
      kind: 'prompt',
      session_id: opened.sessionId,
      expected_epoch: opened.claim.epoch,
      delivery_id: randomUUID(),
      text,
      attachments: [],
    });
  }

  control(opened: Opened, kind: 'interrupt' | 'close'): Promise<HarnessRuntimeReceipt> {
    return this.parts.dispatcher.execute(randomUUID(), {
      kind,
      session_id: opened.sessionId,
      expected_epoch: opened.claim.epoch,
    });
  }

  async finished(count: number): Promise<void> {
    await vi.waitFor(() => {
      expect(this.parts.published.filter((event) => event.kind === 'completed')).toHaveLength(
        count,
      );
    });
  }

  async dispose(): Promise<void> {
    await this.parts.dispatcher.dispose();
    await rm(this.parts.directory, { recursive: true, force: true });
  }
}

export function bootDispatcher(
  target: DshWriterClaim['target'] = { kind: 'device', device_id: randomUUID() },
  install?: (ctx: Context, persistence: ControlPersistence) => Promise<void>,
  extras?: DispatcherExtras,
): Promise<DispatcherFixture> {
  return DispatcherFixture.boot(target, install, extras);
}
