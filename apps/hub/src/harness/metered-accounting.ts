import { MeteredUsageStream } from '@smarteverything/harness/process';
import type { SupplierUsage, SupplierUsageSnapshot } from '@smarteverything/harness/process';
import { ApiError, JSON_VALUE, microsOfUsd, harnessContextPercent } from '@smarteverything/domain';
import type {
  AiUsageRow,
  UsageEntry,
  UsageWork,
  DshWriterClaim,
  AiHarnessSession,
} from '@smarteverything/domain';
import type { HarnessService } from './service';
import type { HarnessGrant } from './grant';
import type { Store } from '../store/store';
import type { Budget } from '../ledger/budget';

const budgets = new WeakMap<Store, Budget['gate']>();
export function bindMeteredBudget(store: Store, gate: Budget['gate']): void {
  budgets.set(store, gate);
}

export function meteredAccountingFetch(
  service: HarnessService,
  sessionId: string,
  fetcher: typeof fetch,
  options: { readonly verify: () => void; readonly ordinary_request?: boolean },
): typeof fetch {
  return async (input, init): Promise<Response> => {
    options.verify();
    const grant = service.storage.grant(sessionId);
    const entry = entryOf(service, grant);
    const budget = budgets.get(service.store);
    if (budget === undefined)
      throw new ApiError('conflict', 'Metered spending admission is not ready.');
    budget.check(entry.work, grant.authority.kind === 'trigger' ? { background: true } : undefined);
    const row = service.store.ledger.record(entry, true);
    const request =
      options.ordinary_request === true ? admitContextRequest(service, grant, row.id) : undefined;
    const observation = new MeteredUsageStream((snapshot): void => {
      service.store.durableWrite(() => {
        service.store.ledger.amend(row.id, changeOf(snapshot, service.store.ledger.get(row.id)));
        if (
          request !== undefined &&
          snapshot.usage !== null &&
          service.store.harnessCoordination.currentContextRequest(request.claim, row.id)
        )
          noteSupplierContext(service, grant, snapshot.usage, request.context);
      });
    });
    return observation.response(await fetcher(input, init));
  };
}
function admitContextRequest(
  service: HarnessService,
  grant: HarnessGrant,
  requestId: string,
): {
  readonly claim: DshWriterClaim;
  readonly context: NonNullable<AiHarnessSession['context_request']>;
} {
  const writer = service.store.dshSessions.writerState(grant.session_id, grant.profile_id);
  if (writer.state !== 'active' || writer.claim === null)
    throw new ApiError('conflict', 'Ordinary supplier context request has no active writer.');
  if (
    writer.claim.runtime_instance !== grant.runtime_instance ||
    writer.claim.connection_generation !== grant.generation
  )
    throw new ApiError(
      'conflict',
      'Ordinary supplier context request belongs to another execution host.',
    );
  const context = {
    id: requestId,
    epoch: writer.claim.epoch,
    provider: grant.route.route_id,
    model: grant.route.model,
    capacity_tokens: supplierContextCapacity(service, grant),
  };
  service.store.harnessCoordination.admitContextRequest(writer.claim, context);
  return { claim: writer.claim, context };
}
function entryOf(service: HarnessService, grant: HarnessGrant): UsageEntry {
  const metadata = service.store.dshSessions.stat(grant.session_id, grant.profile_id);
  if (metadata === undefined)
    throw new ApiError('forbidden', 'Metered inference lost its initiating profile session.');
  const route = service.routes.selected(
    grant.profile_id,
    grant.route,
    grant.authority.kind === 'trigger',
  );
  if (route.auth.provider !== 'openrouter' || route.billing !== 'metered')
    throw new ApiError('forbidden', 'Subscription routes cannot enter metered accounting.');
  const delivery =
    grant.event_id === null ? undefined : service.store.harnessDeliveries.find(grant.event_id);
  if (delivery !== undefined && delivery.session_id !== grant.session_id)
    throw new ApiError('forbidden', 'Metered delivery belongs to another native session.');
  return {
    profile_id: grant.profile_id,
    client_id: grant.client_id,
    chat_id: metadata.chat_id,
    message_id: delivery?.state === 'admitted' ? delivery.reply_id : null,
    source: 'openrouter',
    work: workOf(service, grant, metadata.chat_id),
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
function workOf(service: HarnessService, grant: HarnessGrant, chatId: string): UsageWork {
  if (grant.event_id === null) return 'chat';
  const event = service.store.assistantEvents.event(grant.event_id);
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
function changeOf(
  snapshot: SupplierUsageSnapshot,
  previous: AiUsageRow,
): Parameters<HarnessService['store']['ledger']['amend']>[1] {
  const usage = snapshot.usage;
  if (usage === null) return { generation_id: snapshot.generationId };
  const cost = costOf(usage, previous);
  return {
    generation_id: snapshot.generationId,
    tokens_in: usage.prompt_tokens,
    tokens_out: usage.completion_tokens,
    tokens_cached: usage.prompt_tokens_details?.cached_tokens ?? 0,
    tokens_reasoning: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    cost_micros: cost.micros,
    cost_state: cost.state,
    meta: {
      cost_available: cost.available,
      usage_available: true,
      provider_usage: JSON_VALUE.parse(usage),
      supplier_model: snapshot.model,
    },
  };
}

function costOf(
  usage: SupplierUsage,
  previous: AiUsageRow,
): {
  readonly micros: number;
  readonly state: AiUsageRow['cost_state'];
  readonly available: boolean;
} {
  const cost = usage.cost ?? null;
  const micros = cost === null ? previous.cost_micros : microsOfUsd(cost);
  if (!Number.isSafeInteger(micros))
    throw new ApiError('upstream_failed', 'Reported supplier cost exceeds the accounting range.');
  return {
    micros,
    state: cost === null ? previous.cost_state : 'reported',
    available: cost !== null || previous.meta['cost_available'] === true,
  };
}

function supplierContextCapacity(service: HarnessService, grant: HarnessGrant): number {
  const route = service.routes.selected(
    grant.profile_id,
    grant.route,
    grant.authority.kind === 'trigger',
  );
  const model = route.models.find((entry) => entry.id === grant.route.model);
  if (model === undefined)
    throw new ApiError('conflict', 'Ordinary supplier request lost its exact model.');
  if (model.capabilities.context_tokens === null)
    throw new ApiError('conflict', 'Ordinary supplier request lost its exact context capacity.');
  return model.capabilities.context_tokens;
}
function noteSupplierContext(
  service: HarnessService,
  grant: HarnessGrant,
  usage: SupplierUsage,
  request: NonNullable<AiHarnessSession['context_request']>,
): void {
  const metadata = service.store.dshSessions.stat(grant.session_id, grant.profile_id);
  if (metadata === undefined)
    throw new ApiError('conflict', 'Ordinary supplier usage lost its native conversation.');
  const context = {
    provider: request.provider,
    model: request.model,
    capacity_tokens: request.capacity_tokens,
    input_tokens: usage.prompt_tokens,
    state: 'measured' as const,
  };
  service.store.harnessCoordination.noteContext(grant.session_id, context);
  const percent = harnessContextPercent(context);
  if (percent === null)
    throw new ApiError('conflict', 'Ordinary supplier context pressure is unavailable.');
  service.store.aiChats.noteContext(metadata.chat_id, Math.round(percent));
}
