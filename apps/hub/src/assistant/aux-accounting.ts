import { z } from 'zod';
import type { UsageEntry } from '@smarteverything/domain';
import { meteredBudget } from '../harness/metered-accounting';
import { MeteredUsageStream } from '../harness/metered-usage';
import { assertModelAllowedOf } from './model-scope';
import type { Store } from '../store/store';

export interface AuxCharge {
  readonly chatId: string;
  readonly model: string;
  readonly sessionKey?: string | undefined;
}

async function entryOf(store: Store, charge: AuxCharge): Promise<UsageEntry> {
  const chat = await store.host.call('aiChats', 'chat', charge.chatId);
  return {
    profile_id: chat.profile_id,
    chat_id: chat.id,
    source: 'openrouter',
    work: 'chat',
    model_id: charge.model,
    cost_micros: 0,
    cost_state: 'estimated',
    meta: { cost_available: false, usage_available: false, auxiliary: true },
  };
}

const BODY = z.record(z.string(), z.unknown());

export function withSessionKey(
  init: RequestInit | undefined,
  key: string | undefined,
): RequestInit | undefined {
  if (key === undefined || typeof init?.body !== 'string') return init;
  const body = BODY.safeParse(JSON.parse(init.body));
  return body.success ? { ...init, body: JSON.stringify({ ...body.data, session_id: key }) } : init;
}

export function auxAccountingFetch(
  store: Store,
  charge: AuxCharge,
  fetcher: typeof fetch,
): typeof fetch {
  return async (input, init): Promise<Response> => {
    const entry = await entryOf(store, charge);
    await assertModelAllowedOf(store, entry.profile_id, charge.model);
    meteredBudget(store).check(entry.work, { profileId: entry.profile_id, background: true });
    const row = await store.host.write('ledgerRecordDurable', entry);
    const observation = new MeteredUsageStream(async (snapshot): Promise<void> => {
      await store.host.write('ledgerMeteredAmend', { id: row.id, snapshot, tokensFromDsh: false });
    });
    return observation.response(await fetcher(input, withSessionKey(init, charge.sessionKey)));
  };
}
