import { ApiError } from '@smarteverything/domain';
import type { DshSessionEvent, DshSessionMetadata } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { HarnessDelivery } from '../store/repositories/harness-deliveries';
import type { HostStore } from '../store/host/host-store';

export interface ForkCandidate {
  readonly id: string;
  readonly role: string;
  readonly cut: HarnessDelivery | undefined;
}

export interface ForkPlanRead {
  readonly metadata: DshSessionMetadata;
  readonly events: readonly DshSessionEvent[];
  readonly candidates: readonly ForkCandidate[];
}

export const FORK_PLAN_READ_UNIT = storeUnit(
  (
    store: HostStore,
    input: {
      readonly session_id: string;
      readonly profile_id: string;
      readonly chat_id: string;
      readonly message: string;
    },
  ): ForkPlanRead => {
    const metadata = store.dshSessions.stat(input.session_id, input.profile_id);
    if (metadata === undefined)
      throw new ApiError('not_found', 'The conversation being branched has no native session.');
    const checkpoint = metadata.next_seq - 1;
    if (checkpoint < 0) return { metadata, events: [], candidates: [] };
    return {
      metadata,
      events: store.dshSessions.readAll(input.session_id, input.profile_id, {
        length: checkpoint + 1,
      }),
      candidates: store.assistantSearch
        .upTo(input.chat_id, input.message)
        .toReversed()
        .map((row) => ({
          id: row.id,
          role: row.role,
          cut: store.harnessDeliveries.cutOfMessage(row.id),
        })),
    };
  },
);

export interface ForkSeedRead {
  readonly parent_session: string;
  readonly boundary: number;
  readonly metadata: DshSessionMetadata;
  readonly events: readonly DshSessionEvent[];
  readonly request: string;
}

export const FORK_SEED_READ_UNIT = storeUnit(
  (
    store: HostStore,
    chat: { readonly id: string; readonly profile_id: string },
  ): ForkSeedRead | undefined => {
    const fork = store.harnessRecovery.forkOf(chat.id);
    if (fork === undefined) return undefined;
    const metadata = store.dshSessions.stat(fork.parent_session, chat.profile_id);
    if (metadata === undefined || metadata.next_seq <= fork.boundary)
      throw new ApiError('conflict', 'Native fork lost its complete committed parent checkpoint.');
    const receipt = store.harnessSessions.operation(`fork:${chat.id}`);
    if (receipt === undefined)
      throw new ApiError('conflict', 'Native fork lost its admitted branch point.');
    return {
      parent_session: fork.parent_session,
      boundary: fork.boundary,
      metadata,
      events: store.dshSessions.readAll(fork.parent_session, chat.profile_id, {
        length: fork.boundary + 1,
      }),
      request: receipt.request,
    };
  },
);

export interface HistoryRead {
  readonly metadata: DshSessionMetadata | undefined;
  readonly events: readonly DshSessionEvent[];
  readonly cuts: readonly (HarnessDelivery | undefined)[];
}

export const HISTORY_READ_UNIT = storeUnit(
  (
    store: HostStore,
    input: {
      readonly session_id: string;
      readonly profile_id: string;
      readonly message_ids: readonly string[];
    },
  ): HistoryRead => {
    const metadata = store.dshSessions.stat(input.session_id, input.profile_id);
    if (metadata === undefined) return { metadata, events: [], cuts: [] };
    return {
      metadata,
      events: store.dshSessions.readAll(input.session_id, input.profile_id),
      cuts: input.message_ids.map((id) => store.harnessDeliveries.cutOfMessage(id)),
    };
  },
);
