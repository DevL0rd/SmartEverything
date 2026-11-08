import { z } from 'zod';
import type { UsageEntry } from '@smarteverything/domain';
import { meteredBudget } from '../harness/metered-accounting';
import { ledgerChange } from '../harness/metered-change';
import { MeteredUsageStream } from '../harness/metered-usage';
import { assertModelAllowed } from '../server/person-scope';
import type { Store } from '../store/store';

export interface AuxCharge {
  readonly chatId: string;
  readonly model: string;
  readonly sessionKey?: string | undefined;
}

function entryOf(store: Store, charge: AuxCharge): UsageEntry {
  const chat = store.aiChats.chat(charge.chatId);
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
    const entry = entryOf(store, charge);
    assertModelAllowed(store, entry.profile_id, charge.model);
    meteredBudget(store).check(entry.work, { profileId: entry.profile_id, background: true });
    const row = store.ledger.record(entry, true);
    const observation = new MeteredUsageStream((snapshot): void => {
      store.durableWrite(() => {
        store.ledger.amend(row.id, ledgerChange(snapshot, store.ledger.get(row.id), false));
      });
    });
    return observation.response(await fetcher(input, withSessionKey(init, charge.sessionKey)));
  };
}
