import { z } from 'zod';
import { Context } from '@deepseek-ai/cordis';
import {
  mountAgentLoopTestDependencies,
  mountAgentLoopTestHarness,
} from '@deepseek-ai/dsh-agent-loop-testkit';
import type { AgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { LlmAdapter } from '@deepseek-ai/dsh-llm';
import * as LlmRetry from '@deepseek-ai/dsh-llm-retry';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { ApiKeyCredentials, mount } from '../../src/plugins/providers';
import { MemoryApiKeyVault } from './api-key-vault';
import { DEEPSEEK_KEY_REFERENCE, DEEPSEEK_MODEL, DEEPSEEK_PROVIDER } from './llm-mock-server';

export interface ProviderLoop {
  readonly ctx: Context;
  readonly events: (sessionId: string) => readonly SessionEvent[];
  readonly vault: MemoryApiKeyVault;
  readonly harness: AgentLoopTestHarness;
  readonly agent: (id: string) => Promise<Agent>;
  readonly dispose: () => Promise<void>;
}

export interface ProviderLoopOptions {
  readonly key?: string;
  readonly credentials?: boolean;
}

export async function bootProviderLoop(options: ProviderLoopOptions = {}): Promise<ProviderLoop> {
  const ctx = new Context();
  const vault = new MemoryApiKeyVault(
    options.key === undefined ? {} : { [DEEPSEEK_KEY_REFERENCE]: options.key },
  );
  await mountAgentLoopTestDependencies(ctx);
  await ctx.plugin(LlmRetry);
  if (options.credentials !== false) await ctx.plugin(ApiKeyCredentials, vault);
  await mount(ctx);
  const logs = new Map<string, SessionEvent[]>();
  ctx.on('session/event', (session, event) => {
    const log = logs.get(session.id) ?? [];
    log.push(event);
    logs.set(session.id, log);
  });
  const harness = await mountAgentLoopTestHarness(ctx);
  return {
    ctx,
    events: (sessionId) => logs.get(sessionId) ?? [],
    vault,
    harness,
    agent: (id) =>
      harness.create(SessionId(id), { provider: DEEPSEEK_PROVIDER, model: DEEPSEEK_MODEL }),
    dispose: () => ctx.fiber.dispose(),
  };
}

export async function ask(agent: Agent, text: string): Promise<void> {
  agent.followup(
    createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
  );
  await agent.whenIdle();
}

export type TurnEnd =
  | { readonly kind: 'completed' }
  | { readonly kind: 'error'; readonly code: string; readonly message: string };

const TURN_END = z.object({
  type: z.literal('turn/end'),
  data: z.object({
    reason: z.union([
      z.object({ kind: z.literal('completed') }),
      z.object({
        kind: z.literal('error'),
        error: z.object({ code: z.string(), message: z.string() }),
      }),
    ]),
  }),
});

export function turnEnds(events: readonly SessionEvent[]): readonly TurnEnd[] {
  return events.flatMap((event): readonly TurnEnd[] => {
    const parsed = TURN_END.safeParse(event);
    if (!parsed.success) return [];
    const { reason } = parsed.data.data;
    return [
      reason.kind === 'completed'
        ? { kind: 'completed' }
        : { kind: 'error', code: reason.error.code, message: reason.error.message },
    ];
  });
}

export interface AdapterLoop {
  readonly events: (sessionId: string) => readonly SessionEvent[];
  readonly agent: (id: string) => Promise<Agent>;
  readonly dispose: () => Promise<void>;
}

export async function bootAdapterLoop(route: {
  readonly provider: string;
  readonly model: string;
  readonly adapter: LlmAdapter;
}): Promise<AdapterLoop> {
  const ctx = new Context();
  await mountAgentLoopTestDependencies(ctx);
  await ctx.plugin(LlmRetry);
  ctx.effect(() => ctx.llm.registerAdapter([route.provider], route.adapter));
  const logs = new Map<string, SessionEvent[]>();
  ctx.on('session/event', (session, event) => {
    const log = logs.get(session.id) ?? [];
    log.push(event);
    logs.set(session.id, log);
  });
  const harness = await mountAgentLoopTestHarness(ctx);
  return {
    events: (sessionId) => logs.get(sessionId) ?? [],
    agent: (id) => harness.create(SessionId(id), { provider: route.provider, model: route.model }),
    dispose: () => ctx.fiber.dispose(),
  };
}
