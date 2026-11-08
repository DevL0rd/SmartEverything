import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { appendPluginRecord, SessionId } from '@deepseek-ai/dsh-session';
import { isAdjacentAgentSendMessageTool } from '@deepseek-ai/dsh-subagent/internal';
import {
  HELPER_RELAY_RECEIPT,
  HELPER_RELAY_RECEIPT_DATA,
  helperInputId,
} from '../host/helper-input';

type Receipt = z.infer<typeof HELPER_RELAY_RECEIPT_DATA>;
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    'plugin:smarteverything/helper-relay-receipt': Receipt;
  }
}

const TARGET = z.object({ agent_id: z.string() });
const ACCEPTED = z.object({ messageId: z.uuid() });

export function observeHelperRelayReceipts(ctx: Context): void {
  const directed = new WeakMap<Agent, { readonly turn: number; readonly id: string }>();
  ctx.on('agent/pre-step', async ({ agent, turn, messages }, next) => {
    if (directed.get(agent)?.turn !== turn) directed.delete(agent);
    for (const message of messages) {
      const id = helperInputId(message);
      if (id !== undefined) directed.set(agent, { turn, id });
    }
    return next();
  });
  ctx.on('tools/post-execute', async (execution, result, next) => {
    const { agent } = execution;
    if (agent === undefined || execution.name !== 'send_message' || result.isError) return next();
    const input = directed.get(agent);
    const parentId = agent.session.header.parentSession;
    const target = TARGET.safeParse(execution.arguments);
    if (
      input === undefined ||
      parentId === undefined ||
      !target.success ||
      target.data.agent_id !== parentId ||
      !isAdjacentAgentSendMessageTool(ctx.tools.get(execution.name, agent))
    )
      return next();
    const accepted = ACCEPTED.parse(result.value);
    const parent = ctx.agents.get(SessionId(parentId));
    if (parent !== undefined) await ctx.sessions.flush(parent.session);
    appendPluginRecord(
      agent.session,
      HELPER_RELAY_RECEIPT,
      HELPER_RELAY_RECEIPT_DATA.parse({
        deliveryId: input.id,
        parentSessionId: parentId,
        messageId: accepted.messageId,
      }),
    );
    return next();
  });
}
