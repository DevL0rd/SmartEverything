import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AI_HARNESS_EVENT, HARNESS_NATIVE_FRAME } from '@smarteverything/domain';
import type { AiUsageRow, DshSessionEvent } from '@smarteverything/domain';
import { ledgerChange, supplierTokens } from '../../../src/harness/metered-change';
import type { SupplierUsage, SupplierUsageSnapshot } from '../../../src/harness/metered-usage';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

interface Opened {
  readonly chatId: string;
  readonly sessionId: string;
  readonly epoch: number;
  readonly log: (events: readonly DshSessionEvent[]) => void;
}

async function open(): Promise<Opened> {
  const chat = rig.newChat(rig.hub.target);
  const request = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), request);
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.hub.target).host,
  );
  rig.service.native(
    HARNESS_NATIVE_FRAME.parse({
      session_id: request.claim.session_id,
      epoch: request.claim.epoch,
      kind: 'open',
    }),
  );
  return {
    chatId: chat.id,
    sessionId: request.claim.session_id,
    epoch: request.claim.epoch,
    log: (events): void => {
      const stat = rig.opened.store.dshSessions.stat(request.claim.session_id, rig.owner.profileId);
      const appended = rig.opened.store.dshSessions.append(
        {
          claim: request.claim,
          operation_id: randomUUID(),
          events: events.map((event, index) => ({ ...event, seq: (stat?.next_seq ?? 0) + index })),
        },
        principal,
      );
      rig.opened.store.dshSessions.flush(
        { claim: request.claim, expected_next_seq: appended.next_seq },
        principal,
      );
    },
  };
}

function reply(usage: Record<string, number>): DshSessionEvent {
  return {
    type: 'assistant/message',
    seq: 0,
    time: 1,
    surfaceOp: 'append',
    data: {
      turn: 0,
      step: 0,
      message: {
        id: randomUUID(),
        role: 'assistant',
        source: { kind: 'model', provider: 'p', model: 'm' },
        content: [{ type: 'text', text: 'hello' }],
      },
      stream: [{ type: 'chunk', time: 1, chunk: { type: 'usage', usage } }],
    },
  };
}

function requestContext(contextWindow: number): DshSessionEvent {
  return {
    type: 'request/context',
    seq: 0,
    time: 1,
    ignorable: true,
    data: { provider: 'route', model: 'model-a', contextWindow },
  };
}

function metered(opened: Opened): AiUsageRow {
  return rig.opened.store.ledger.record({
    profile_id: rig.owner.profileId,
    chat_id: opened.chatId,
    source: 'openrouter',
    work: 'chat',
    model_id: 'model-a',
    cost_micros: 0,
    cost_state: 'estimated',
  });
}

const SUPPLIER_USAGE: SupplierUsage = {
  prompt_tokens: 1025,
  completion_tokens: 40,
  cost: 0.0042,
  prompt_tokens_details: { cached_tokens: 900, cache_write_tokens: 25 },
  completion_tokens_details: { reasoning_tokens: 12 },
};
const SNAPSHOT: SupplierUsageSnapshot = {
  generationId: 'gen-1',
  model: 'model-a',
  usage: SUPPLIER_USAGE,
};
const SUPPLIER_TOKENS = supplierTokens(SUPPLIER_USAGE);

function supplierCost(row: AiUsageRow, tokensFromDsh: boolean): AiUsageRow {
  return rig.opened.store.ledger.amend(row.id, ledgerChange(SNAPSHOT, row, tokensFromDsh));
}

describe('ledger tokens of an agent loop request', () => {
  it('come from the stored model reply while the cost stays the supplier receipt', async () => {
    const opened = await open();
    const row = supplierCost(metered(opened), true);
    expect(row).toMatchObject({ tokens_in: 0, cost_micros: 4200, generation_id: 'gen-1' });
    rig.service.dshUsage.expect(opened.sessionId, row.id, SUPPLIER_TOKENS);

    opened.log([
      reply({
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 900,
        cacheWriteTokens: 25,
        reasoningTokens: 12,
      }),
    ]);

    expect(rig.opened.store.ledger.get(row.id)).toMatchObject({
      tokens_in: 1025,
      tokens_out: 40,
      tokens_cached: 900,
      tokens_reasoning: 12,
      cost_micros: 4200,
      cost_state: 'reported',
      generation_id: 'gen-1',
      meta: { tokens_source: 'dsh', cache_write_tokens: 25, usage_available: true },
    });
  });

  it('settle one row per stored reply, in order', async () => {
    const opened = await open();
    const first = supplierCost(metered(opened), true);
    rig.service.dshUsage.expect(opened.sessionId, first.id, SUPPLIER_TOKENS);
    opened.log([reply({ inputTokens: 10, outputTokens: 1 })]);
    const second = supplierCost(metered(opened), true);
    rig.service.dshUsage.expect(opened.sessionId, second.id, SUPPLIER_TOKENS);
    opened.log([reply({ inputTokens: 20, outputTokens: 2 })]);

    expect(rig.opened.store.ledger.get(first.id)).toMatchObject({ tokens_in: 10, tokens_out: 1 });
    expect(rig.opened.store.ledger.get(second.id)).toMatchObject({ tokens_in: 20, tokens_out: 2 });
  });

  it('fall back to the supplier count, visibly, when the next request finds no stored reply', async () => {
    const opened = await open();
    const lost = supplierCost(metered(opened), true);
    rig.service.dshUsage.expect(opened.sessionId, lost.id, SUPPLIER_TOKENS);
    const next = supplierCost(metered(opened), true);

    rig.service.dshUsage.expect(opened.sessionId, next.id, SUPPLIER_TOKENS);

    expect(rig.opened.store.ledger.get(lost.id)).toMatchObject({
      tokens_in: 1025,
      tokens_out: 40,
      meta: { tokens_source: 'supplier' },
    });
    expect(rig.opened.store.ledger.get(next.id).tokens_in).toBe(0);
  });

  it('leave a request that is not an agent loop request with the supplier count', async () => {
    const opened = await open();

    const row = supplierCost(metered(opened), false);

    expect(row).toMatchObject({
      tokens_in: 1025,
      tokens_cached: 900,
      tokens_reasoning: 12,
      cost_micros: 4200,
      meta: { tokens_source: 'supplier' },
    });
  });

  it('ignore a stored reply when no metered request waits for it', async () => {
    const opened = await open();
    const row = metered(opened);

    opened.log([reply({ inputTokens: 5, outputTokens: 5 })]);

    expect(rig.opened.store.ledger.get(row.id).tokens_in).toBe(0);
  });
});

describe('context pressure of a chat', () => {
  it('shows the same percent for the numbers the stored reply measured', async () => {
    const opened = await open();

    opened.log([requestContext(1000), reply({ inputTokens: 90, outputTokens: 3 })]);

    expect(rig.service.state(rig.owner, opened.chatId).context).toMatchObject({
      capacity_tokens: 1000,
      input_tokens: 90,
      state: 'measured',
    });
    expect(rig.opened.store.aiChats.chat(opened.chatId).context_percent).toBe(9);
  });

  it('is not changed by an event from a stale writer epoch', async () => {
    const opened = await open();
    opened.log([requestContext(1000), reply({ inputTokens: 90, outputTokens: 3 })]);
    const stale = AI_HARNESS_EVENT.parse({
      session_id: opened.sessionId,
      chat_id: opened.chatId,
      epoch: opened.epoch + 1,
      seq: 50,
      kind: 'usage',
      usage: {
        input_tokens: 900,
        output_tokens: 1,
        total_tokens: null,
        cost_usd: null,
        duration_ms: null,
        tool_uses: null,
      },
      context_percent: 90,
    });

    expect(() => {
      rig.service.publish(stale);
    }).toThrow('stale chat or native epoch');
    expect(rig.opened.store.aiChats.chat(opened.chatId).context_percent).toBe(9);
  });
});
