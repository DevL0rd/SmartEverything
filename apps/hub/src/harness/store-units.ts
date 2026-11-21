import type { z } from 'zod';
import { AI_HARNESS_SESSION, ApiError } from '@smarteverything/domain';
import type {
  AiChatRow,
  DshEngine,
  AiHarnessEvent,
  AiModelRouteSelection,
  AiHarnessPermissionChange,
  AiHarnessSession,
  DshSessionEvent,
  DshSessionMetadata,
  DshWriterClaim,
} from '@smarteverything/domain';
import { durableStoreUnit, storeUnit } from '../store/host/unit';
import type { DshSessionPrincipal } from '../store/repositories/dsh-session-claims';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { HarnessDelivery } from '../store/repositories/harness-deliveries';
import type { HostStore } from '../store/host/host-store';
import type { EffectKind } from '../store/repositories/harness-effects';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import { effectiveTools } from '../assistant/tool-scope';
import { turnFactsOf, type TurnFacts } from '../assistant/prompt-facts';
import { type AuthorityScope } from '../assistant/turn-authority';
import { issueEventAuthority } from '../assistant/event-authority-issue';
import type { ConversationAuthority } from './authority-contract';
import { noteChatMeters } from './chat-meters';
import type { HARNESS_GRANT, HarnessGrant } from './grant';
import { checkedGrant } from './grant-check';
import { refusedNativeInput } from './input-refusal';

export interface SessionView {
  readonly state: AiHarnessSession | undefined;
  readonly metadata: DshSessionMetadata | undefined;
  readonly permission_change: AiHarnessPermissionChange | null;
}

export const SESSION_VIEW_UNIT = storeUnit(
  (
    store: HostStore,
    input: { readonly session_id: string; readonly profile_id: string },
  ): SessionView => {
    const state = store.harnessSessions.state(input.session_id);
    if (state === undefined) return { state, metadata: undefined, permission_change: null };
    return {
      state,
      metadata: store.dshSessions.stat(input.session_id, input.profile_id),
      permission_change: store.harnessSessions.permissionChange(input.session_id),
    };
  },
);

export interface BoundSession {
  readonly session_id: string;
  readonly profile_id: string;
  readonly chat_id: string;
}

export function assertBoundSession(
  store: Pick<HostStore, 'dshSessions'>,
  bound: BoundSession,
): void {
  if (store.dshSessions.stat(bound.session_id, bound.profile_id)?.chat_id !== bound.chat_id)
    throw new ApiError('forbidden', 'This native binding belongs to another conversation.');
}

export const TURN_RUNNING_UNIT = storeUnit((store: HostStore, bound: BoundSession): boolean => {
  assertBoundSession(store, bound);
  return store.harnessDeliveries.pending(bound.session_id).length > 0;
});

export const BOUND_OPERATION_UNIT = durableStoreUnit(
  (
    store: HostStore,
    input: BoundSession & { readonly operation_id: string; readonly request: unknown },
  ): { readonly state: 'pending' | 'completed' | 'unknown' } => {
    assertBoundSession(store, input);
    return store.harnessSessions.begin(input.operation_id, input.session_id, input.request);
  },
);

export const WORK_CHAT_UNIT = storeUnit((store: HostStore, sessionId: string): string => {
  const grant = store.harnessSessions.grant(sessionId);
  if (grant === undefined)
    throw new ApiError('conflict', 'Native work has no admitted session grant.');
  const metadata = store.dshSessions.stat(sessionId, grant.profile_id);
  if (metadata === undefined)
    throw new ApiError('conflict', 'Native work has no stored conversation.');
  return metadata.chat_id;
});

export interface EventInputs {
  readonly grant: HarnessGrant;
  readonly session: AiHarnessSession | undefined;
  readonly refusal: ReturnType<ApiError['body']> | undefined;
  readonly permission:
    | {
        readonly session_id: string;
        readonly request: string;
        readonly state: 'pending' | 'completed' | 'unknown';
      }
    | undefined;
  readonly metadata: DshSessionMetadata | undefined;
  readonly workspace: string | undefined;
  readonly claim: DshWriterClaim | null;
}

export const EVENT_INPUTS_UNIT = storeUnit(
  (store: HostStore, event: AiHarnessEvent): EventInputs => {
    const grant = checkedGrant(store, event.session_id);
    const session = store.harnessSessions.state(event.session_id);
    const refusal = refusedNativeInput(store, event)?.body();
    const state = event.kind === 'state';
    const operation =
      state && event.permission_operation_id !== undefined
        ? store.harnessSessions.operation(event.permission_operation_id)
        : undefined;
    return {
      grant,
      session,
      refusal,
      permission: operation,
      metadata: state ? store.dshSessions.stat(event.session_id, grant.profile_id) : undefined,
      workspace: state
        ? store.dshSessions.workspace(event.session_id, grant.target, grant.profile_id)?.cwd
        : undefined,
      claim:
        state && event.session.directory !== null
          ? store.dshSessions.attached(event.session_id, grant.profile_id)
          : null,
    };
  },
);

export interface WorkspaceChange {
  readonly claim: DshWriterClaim;
  readonly cwd: string;
  readonly principal: DshSessionPrincipal;
  readonly grant: HarnessGrant;
}

export interface EventAccept {
  readonly next: AiHarnessSession;
  readonly published: AiHarnessEvent;
  readonly accept: boolean;
  readonly policy: AiHarnessPermissionChange | undefined;
  readonly workspace: WorkspaceChange | undefined;
}

export const EVENT_ACCEPT_UNIT = durableStoreUnit((store: HostStore, input: EventAccept): void => {
  const { workspace, published, policy } = input;
  if (workspace !== undefined) {
    store.dshSessions.saveWorkspace(
      { claim: workspace.claim, cwd: workspace.cwd },
      workspace.principal,
    );
    store.harnessSessions.issue({ ...workspace.grant, cwd: workspace.cwd });
  }
  if (!input.accept) return;
  store.harnessSessions.accept(
    input.next,
    published,
    (): void => {
      if (policy !== undefined) {
        const chat = dshEngine(store, published.chat_id);
        store.aiChats.update(chat.id, {
          engine: { ...chat.engine, permission: policy.permission },
        });
      }
      noteChatMeters(store, published);
    },
    policy,
  );
});

function dshEngine(
  store: Pick<HostStore, 'aiChats'>,
  chatId: string,
): AiChatRow & { engine: DshEngine } {
  const chat = store.aiChats.chat(chatId);
  if (chat.engine.kind !== 'dsh')
    throw new ApiError('conflict', 'This chat has a different native engine boundary.');
  return { ...chat, engine: chat.engine };
}

export const PERMISSION_BEGIN_UNIT = durableStoreUnit(
  (
    store: HostStore,
    {
      session_id,
      input,
    }: { readonly session_id: string; readonly input: AiHarnessPermissionChange },
  ): { readonly state: 'pending' | 'completed' | 'unknown' } => {
    const prior = store.harnessSessions.operation(input.operation_id);
    const request: unknown =
      prior === undefined ? { kind: 'permission', ...input } : JSON.parse(prior.request);
    return store.harnessSessions.begin(input.operation_id, session_id, request);
  },
);

export const PERMISSION_RECOVER_UNIT = durableStoreUnit(
  (
    store: HostStore,
    input: {
      readonly session: AiHarnessSession;
      readonly input: AiHarnessPermissionChange;
      readonly chat_id: string;
    },
  ): void => {
    store.harnessSessions.recoverPermission(input.session, input.input, () => {
      const chat = dshEngine(store, input.chat_id);
      store.aiChats.update(chat.id, {
        engine: { ...chat.engine, permission: input.input.permission },
      });
    });
  },
);

export interface IngestRead {
  readonly metadata: DshSessionMetadata;
  readonly opening:
    | {
        readonly session: AiHarnessSession;
        readonly history: readonly unknown[];
        readonly nextPublicationSeq: number;
      }
    | undefined;
}

export const INGEST_READ_UNIT = storeUnit(
  (
    store: HostStore,
    input: { readonly session_id: string; readonly opening: boolean },
  ): IngestRead => {
    const id = input.session_id;
    const grant = store.harnessSessions.grant(id);
    if (grant === undefined)
      throw new ApiError('forbidden', 'This native session has no active conversation grant.');
    const metadata = store.dshSessions.stat(id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('conflict', 'Native session metadata is unavailable.');
    if (!input.opening) return { metadata, opening: undefined };
    const publication = store.harnessSessions.publication(id);
    if (publication === undefined)
      throw new ApiError('conflict', 'Native session projection is unavailable.');
    return {
      metadata,
      opening: {
        session: publication.projection,
        history: store.dshSessions.readAll(id, grant.profile_id),
        nextPublicationSeq: publication.event_seq,
      },
    };
  },
);

export interface MeteredInputs {
  readonly metadata: DshSessionMetadata | undefined;
  readonly delivery: HarnessDelivery | undefined;
  readonly event: StoredEvent | undefined;
}

export const METERED_INPUTS_UNIT = storeUnit(
  (store: HostStore, grant: HarnessGrant): MeteredInputs => ({
    metadata: store.dshSessions.stat(grant.session_id, grant.profile_id),
    delivery: grant.event_id === null ? undefined : store.harnessDeliveries.find(grant.event_id),
    event: grant.event_id === null ? undefined : store.assistantEvents.event(grant.event_id),
  }),
);

export interface MirroredSession {
  readonly grant: HarnessGrant;
  readonly chat: AiChatRow;
  readonly authority: ConversationAuthority | undefined;
  readonly tools: readonly string[] | null;
  readonly facts: TurnFacts;
}

function mirrored(
  store: HostStore,
  id: string,
  authority: (event: StoredEvent) => ConversationAuthority | undefined,
): MirroredSession {
  const grant = checkedGrant(store, id);
  const metadata = store.dshSessions.stat(id, grant.profile_id);
  if (metadata === undefined)
    throw new ApiError('not_found', 'Native tool conversation is absent.');
  const chat = store.aiChats.chat(metadata.chat_id);
  return {
    grant,
    chat,
    authority:
      grant.event_id === null ? undefined : authority(store.assistantEvents.event(grant.event_id)),
    tools: effectiveTools(store, chat),
    facts: turnFactsOf(store, {
      profileId: chat.profile_id,
      chatId: chat.id,
      clientId: grant.client_id,
    }),
  };
}

export const MIRROR_READ_UNIT = storeUnit((store: HostStore, id: string): MirroredSession =>
  mirrored(store, id, (event) => store.harnessRecovery.authority(event.id)),
);

export const MIRROR_ISSUE_UNIT = storeUnit(
  (
    store: HostStore,
    input: { readonly id: string; readonly scope: AuthorityScope },
  ): MirroredSession =>
    mirrored(store, input.id, (event) => issueEventAuthority(store, event, input.scope)),
);

export const ATTACHMENT_UNIT = storeUnit(
  (
    store: HostStore,
    input: { readonly session_id: string; readonly id: string },
  ): StoredAttachment => {
    const grant = checkedGrant(store, input.session_id);
    const metadata = store.dshSessions.stat(input.session_id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('not_found', 'Native attachment conversation is absent.');
    const file = store.assistantChat
      .attachmentsOfChat(metadata.chat_id)
      .find((entry) => entry.id === input.id && entry.profile_id === grant.profile_id);
    if (file === undefined)
      throw new ApiError(
        'forbidden',
        'Attachment is not attached to this initiating conversation.',
      );
    return file;
  },
);

export const MEDIA_AUTHORITY_UNIT = storeUnit(
  (
    store: HostStore,
    input: {
      readonly claim: DshWriterClaim;
      readonly host: {
        readonly target: DshSessionPrincipal['target'];
        readonly platform: DshSessionPrincipal['platform'];
      };
      readonly runtime_instance: string;
      readonly connection_generation: string;
    },
  ): { readonly profileId: string; readonly chatId: string } => {
    const { profile_id: profileId } = checkedGrant(store, input.claim.session_id);
    const metadata = store.dshSessions.stat(input.claim.session_id, profileId);
    if (metadata === undefined)
      throw new ApiError(
        'not_found',
        'This chat’s native conversation is gone; send a new message.',
      );
    store.dshSessions.verifyWriter(input.claim, {
      profile_id: profileId,
      target: input.host.target,
      runtime_instance: input.runtime_instance,
      connection_generation: input.connection_generation,
      platform: input.host.platform,
    });
    return { profileId, chatId: metadata.chat_id };
  },
);

function compatibleHarnessContext(
  context: AiHarnessSession['context'],
  selection: AiModelRouteSelection,
  capacity: number | null,
): AiHarnessSession['context'] {
  if (context === undefined) return undefined;
  return context.provider === selection.route_id &&
    context.model === selection.model &&
    (capacity === null || context.capacity_tokens === capacity)
    ? context
    : undefined;
}

export interface OpeningBind {
  readonly chat_id: string;
  readonly engine: DshEngine;
  readonly grant: z.input<typeof HARNESS_GRANT>;
  readonly capacity: number | null;
  readonly projection: Omit<AiHarnessSession, 'context'>;
}

export const OPENING_BIND_UNIT = durableStoreUnit((store: HostStore, input: OpeningBind): void => {
  store.aiChats.update(input.chat_id, { engine: input.engine });
  store.harnessSessions.issue(input.grant);
  const retained = store.harnessSessions.state(input.projection.session_id)?.context;
  store.harnessSessions.project(
    AI_HARNESS_SESSION.parse({
      ...input.projection,
      context: compatibleHarnessContext(retained, input.projection.route, input.capacity),
    }),
    0,
  );
});

export const EFFECT_AUTHORITIES_UNIT = storeUnit(
  (
    store: HostStore,
    input: { readonly kind: EffectKind; readonly id: string },
  ): readonly ConversationAuthority[] | undefined =>
    store.harnessRecovery.effects
      .find(input.kind, input.id)
      ?.authorities.flatMap((event) => store.harnessRecovery.authority(event) ?? []),
);

export const SESSION_LOG_UNIT = storeUnit(
  (
    store: HostStore,
    input: { readonly session_id: string; readonly profile_id: string },
  ): {
    readonly metadata: DshSessionMetadata;
    readonly events: readonly DshSessionEvent[];
  } | null => {
    const metadata = store.dshSessions.stat(input.session_id, input.profile_id);
    if (metadata === undefined) return null;
    return { metadata, events: store.dshSessions.readAll(input.session_id, input.profile_id) };
  },
);
