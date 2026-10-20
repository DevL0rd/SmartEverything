import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types';
import type { HarnessPlatform } from '@smarteverything/domain';
import type { HarnessHost } from '../../src/host/contracts';
import type { HarnessRuntime } from '../../src/host/runtime';
import type { HarnessRuntimeEvent } from '../../src/host/events';
import type {
  HarnessDesiredConfiguration,
  InstalledHarnessPlugin,
} from '../../src/composition/configuration';
import type { HarnessServerToolAccess } from '../../src/host/server-policy';
import type { HarnessInteractionPort } from '../../src/host/interactions';
import { createHarnessRuntime } from '../../src/host/create-runtime';
import { MemoryPersistence } from './memory-persistence';
import { SCRIPTED_MODEL, SCRIPTED_PROVIDER, ScriptedModel } from './scripted-model';

export interface RuntimeFixture {
  readonly runtime: HarnessRuntime;
  readonly persistence: MemoryPersistence;
  readonly model: ScriptedModel;
  readonly events: HarnessRuntimeEvent[];
  readonly approvals: ApprovalRequestEvent[];
  readonly directory: string;
  readonly workspace: string;
  readonly sessionOptions: (sessionId?: string) => {
    readonly sessionId: string;
    readonly provider: string;
    readonly model: string;
    readonly directory: string;
  };
  readonly dispose: () => Promise<void>;
}

export const EMPTY_CONFIGURATION: HarnessDesiredConfiguration = {
  revision: 'test-empty',
  entries: [],
};

export interface BootOptions {
  readonly target?: HarnessHost['target'];
  readonly platform?: HarnessPlatform;
  readonly approval?: ApprovalOutcome;
  readonly interactions?: HarnessInteractionPort;
  readonly serverToolAccess?: HarnessServerToolAccess;
  readonly configurationPending?: (revision: string) => void;
  readonly desiredConfiguration?: HarnessDesiredConfiguration;
  readonly mount?: (ctx: Context) => void;
  readonly installedPlugins?: (host: HarnessHost) => readonly InstalledHarnessPlugin[];
}

interface Scratch {
  readonly directory: string;
  readonly workspace: string;
  readonly host: HarnessHost;
}

async function scratch(boot: BootOptions): Promise<Scratch> {
  const directory = await mkdtemp(join(tmpdir(), 'harness-test-'));
  const workspace = join(directory, 'home');
  await mkdir(workspace);
  return {
    directory,
    workspace,
    host: {
      target: boot.target ?? { kind: 'device', device_id: randomUUID() },
      name: 'Test machine',
      platform: boot.platform ?? 'linux',
      homeDirectory: workspace,
      stateDirectory: join(directory, 'state'),
    },
  };
}

function interactionsOf(
  approval: ApprovalOutcome,
  approvals: ApprovalRequestEvent[],
): HarnessInteractionPort {
  return {
    approve: (request): Promise<ApprovalOutcome> => {
      approvals.push(request);
      return Promise.resolve(approval);
    },
    question: () => Promise.reject(new Error('The test host answers no questions.')),
  };
}

function installRoutes(
  model: ScriptedModel,
  mount: BootOptions['mount'],
): (ctx: Context) => Promise<void> {
  return async (ctx) => {
    await ctx.inject(['llm', 'tools'], (active: Context): void => {
      const registration = active.llm.registerAdapter([SCRIPTED_PROVIDER], model);
      active.effect(() => registration);
      mount?.(active);
    });
  };
}

export async function bootRuntime(boot: BootOptions = {}): Promise<RuntimeFixture> {
  const { directory, workspace, host } = await scratch(boot);
  const persistence = new MemoryPersistence();
  const model = new ScriptedModel();
  const events: HarnessRuntimeEvent[] = [];
  const approvals: ApprovalRequestEvent[] = [];
  const runtime = await createHarnessRuntime({
    host,
    ...(boot.serverToolAccess === undefined ? {} : { serverToolAccess: boot.serverToolAccess }),
    persistence,
    interactions: boot.interactions ?? interactionsOf(boot.approval ?? 'allowed-once', approvals),
    desiredConfiguration: boot.desiredConfiguration ?? EMPTY_CONFIGURATION,
    installedPlugins: boot.installedPlugins?.(host) ?? [],
    configurationChanged: (): void => undefined,
    ...(boot.configurationPending === undefined
      ? {}
      : { configurationPending: boot.configurationPending }),
    onEvent: (event) => {
      events.push(event);
    },
    installModelRoutes: installRoutes(model, boot.mount),
  });
  return {
    runtime,
    persistence,
    model,
    events,
    approvals,
    directory,
    workspace,
    sessionOptions: (sessionId = randomUUID()) => ({
      sessionId,
      provider: SCRIPTED_PROVIDER,
      model: SCRIPTED_MODEL,
      directory: workspace,
    }),
    dispose: async (): Promise<void> => {
      await runtime.dispose();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export interface Spoken {
  readonly role: string;
  readonly text: string;
}

export function spoken(
  messages: readonly { readonly role: string; readonly content?: unknown }[],
): readonly Spoken[] {
  return messages.map((message) => ({
    role: message.role,
    text: Array.isArray(message.content)
      ? message.content
          .flatMap((part: unknown) => {
            const parsed = TEXT_PART.safeParse(part);
            return parsed.success ? [parsed.data.text] : [];
          })
          .join('')
      : '',
  }));
}

export function eventTypes(events: readonly HarnessRuntimeEvent[]): readonly string[] {
  return events.flatMap((event) => (event.kind === 'session' ? [event.event.type] : []));
}

export function statuses(events: readonly HarnessRuntimeEvent[]): readonly string[] {
  return events.flatMap((event) => (event.kind === 'status' ? [event.status] : []));
}

const TEXT_PART = z.object({ type: z.literal('text'), text: z.string() });

const STREAM_TEXT = z.object({
  kind: z.literal('stream'),
  frame: z.object({
    type: z.literal('chunk'),
    chunk: z.object({ type: z.literal('text-delta'), text: z.string() }),
  }),
});

export function streamedText(events: readonly HarnessRuntimeEvent[]): string {
  return events
    .flatMap((event) => {
      const parsed = STREAM_TEXT.safeParse(event);
      return parsed.success ? [parsed.data.frame.chunk.text] : [];
    })
    .join('');
}

const ASSISTANT_MESSAGE = z.object({
  type: z.literal('assistant/message'),
  data: z.object({ message: z.object({ content: z.array(z.unknown()) }) }),
});

export function assistantReplies(events: readonly { readonly type: string }[]): readonly string[] {
  return events.flatMap((event) => {
    const parsed = ASSISTANT_MESSAGE.safeParse(event);
    return parsed.success
      ? [spoken([{ role: 'assistant', content: parsed.data.data.message.content }])[0]?.text ?? '']
      : [];
  });
}

export async function turnsFinished(
  host: RuntimeFixture,
  session: { readonly flush: () => Promise<void> },
  count: number,
): Promise<void> {
  await vi.waitFor(() => {
    expect(statuses(host.events).filter((status) => status === 'idle')).toHaveLength(count);
  });
  await session.flush();
}

const USER_MESSAGE = z.object({
  type: z.literal('user/message'),
  data: z.object({ source: z.object({ kind: z.literal('user') }), content: z.array(z.unknown()) }),
});

export function userMessages(events: readonly { readonly type: string }[]): readonly string[] {
  return events.flatMap((event) => {
    const parsed = USER_MESSAGE.safeParse(event);
    return parsed.success
      ? [spoken([{ role: 'user', content: parsed.data.data.content }])[0]?.text ?? '']
      : [];
  });
}
