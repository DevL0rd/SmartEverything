import { MeteredUsageStream } from './metered-usage';
import { supplierTokens } from './metered-change';
import { ApiError } from '@smarteverything/domain';
import type { UsageEntry, UsageWork } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { HarnessService } from './service';
import type { HarnessGrant } from './grant';
import type { Store } from '../store/store';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { MeteredInputs } from './store-units';
import type { Budget } from '../ledger/budget';
import { assertModelAllowed } from '../server/person-scope';

const log = new Logger('hub.harness');
const budgets = new WeakMap<Store, Budget['gate']>();
export function bindMeteredBudget(store: Store, gate: Budget['gate']): void {
  budgets.set(store, gate);
}

export function meteredBudget(store: Store): Budget['gate'] {
  const gate = budgets.get(store);
  if (gate === undefined)
    throw new ApiError('conflict', 'Metered spending admission is not ready.');
  return gate;
}

export function meteredAccountingFetch(
  service: HarnessService,
  sessionId: string,
  fetcher: typeof fetch,
  options: { readonly verify: () => Promise<void>; readonly ordinary_request?: boolean },
): typeof fetch {
  return async (input, init): Promise<Response> => {
    await options.verify();
    const grant = await service.storage.grant(sessionId);
    const entry = entryOf(
      service,
      grant,
      await service.store.host.read('harnessMeteredInputs', grant),
    );
    assertModelAllowed(service.store, entry.profile_id, grant.route.model);
    meteredBudget(service.store).check(entry.work, {
      profileId: entry.profile_id,
      ...(grant.authority.kind === 'trigger' ? { background: true as const } : {}),
    });
    const row = await service.store.host.write('ledgerRecordDurable', entry);
    const tokensFromDsh = options.ordinary_request === true;
    const observation = new MeteredUsageStream(async (snapshot): Promise<void> => {
      await service.store.host.write('ledgerMeteredAmend', {
        id: row.id,
        snapshot,
        tokensFromDsh,
      });
      if (snapshot.usage === null) return;
      if (tokensFromDsh) service.dshUsage.expect(sessionId, row.id, supplierTokens(snapshot.usage));
      else log.debug('harness.supplier_tokens', { sessionId, rowId: row.id });
    });
    return observation.response(await fetcher(input, init));
  };
}
function entryOf(service: HarnessService, grant: HarnessGrant, inputs: MeteredInputs): UsageEntry {
  const { metadata, delivery } = inputs;
  if (metadata === undefined)
    throw new ApiError('forbidden', 'Metered inference lost its initiating profile session.');
  const route = service.routes.selected(
    grant.profile_id,
    grant.route,
    grant.authority.kind === 'trigger',
  );
  if (route.auth.provider !== 'openrouter' || route.billing !== 'metered')
    throw new ApiError('forbidden', 'Subscription routes cannot enter metered accounting.');
  if (delivery !== undefined && delivery.session_id !== grant.session_id)
    throw new ApiError('forbidden', 'Metered delivery belongs to another native session.');
  return {
    profile_id: grant.profile_id,
    client_id: grant.client_id,
    chat_id: metadata.chat_id,
    message_id: delivery?.state === 'admitted' ? delivery.reply_id : null,
    source: 'openrouter',
    work: workOf(grant, metadata.chat_id, inputs.event),
    model_id: grant.route.model,
    cost_micros: 0,
    cost_state: 'estimated',
    meta: {
      harness_session_id: grant.session_id,
      harness_event_id: grant.event_id,
      cost_available: false,
      usage_available: false,
    },
  };
}
export function workOf(
  grant: HarnessGrant,
  chatId: string,
  event: StoredEvent | undefined,
): UsageWork {
  if (grant.event_id === null) return 'chat';
  if (event === undefined)
    throw new ApiError('conflict', 'Metered accounting lost the event of its initiating turn.');
  if (event.profile_id !== grant.profile_id || event.chat_id !== chatId)
    throw new ApiError(
      'forbidden',
      'Metered event belongs to another initiating profile or conversation.',
    );
  if (event.report_to !== null) return 'subagent';
  if (event.kind === 'voice') return 'voice';
  if (event.kind === 'wake') return 'wake';
  if (event.kind === 'report') return 'routine';
  return 'chat';
}
