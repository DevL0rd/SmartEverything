import { Context } from '@deepseek-ai/cordis';
import { SessionLogOffset } from '@deepseek-ai/dsh-session';
import SessionProjection from '@deepseek-ai/dsh-session-projection';
import type { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import * as SessionStats from '@deepseek-ai/dsh-session-stats';
import * as TurnOutline from '@deepseek-ai/dsh-session-turn-outline';
import { AI_SESSION_INFO } from '@smarteverything/domain';
import type { AiSessionInfo, DshSessionMetadata } from '@smarteverything/domain';
import { nativeEvents, nativeHeader } from '../persistence/validation';

export const name = 'session-info';

export async function mount(ctx: Context): Promise<void> {
  await ctx.plugin(SessionStats);
  await ctx.plugin(TurnOutline);
}

let registry: Promise<SessionProjectionRegistry> | undefined;

function coldRegistry(): Promise<SessionProjectionRegistry> {
  registry ??= (async (): Promise<SessionProjectionRegistry> => {
    const root = new Context();
    await root.plugin(SessionProjection);
    await mount(root);
    return root.sessionProjections;
  })();
  return registry;
}

export async function foldSessionInfo(
  metadata: DshSessionMetadata,
  events: unknown,
): Promise<AiSessionInfo> {
  const projections = await coldRegistry();
  const header = nativeHeader(metadata.header);
  const { snapshot } = projections.restore(
    {},
    nativeEvents(header, events),
    SessionLogOffset(0),
    header,
    SessionLogOffset(metadata.inherited_event_count),
  );
  const stats = snapshot.values.sessionStats;
  const turns = snapshot.values.turnOutline;
  if (stats === undefined || turns === undefined)
    throw new Error('The session projections are not registered.');
  return AI_SESSION_INFO.parse({
    stats: {
      turns: stats.turns,
      steps: stats.steps,
      llm_ms: stats.llmMs,
      tool_ms: stats.toolMs,
      ttft_ms: stats.ttftMs,
      ttft_steps: stats.ttftSteps,
      decode_ms: stats.decodeMs,
      decode_tokens: stats.decodeTokens,
    },
    turns: turns.map((entry) => ({
      turn: entry.turn,
      seq: entry.seq,
      prompt: entry.prompt,
      response: entry.response,
    })),
  });
}
