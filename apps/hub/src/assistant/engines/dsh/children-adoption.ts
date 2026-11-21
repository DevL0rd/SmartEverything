import { randomUUID } from 'node:crypto';
import { AI_HARNESS_SESSION, ApiError, DSH_SESSION_ID } from '@smarteverything/domain';
import type {
  AiAgentRun,
  AiChatRow,
  AiHarnessHost,
  DshEngine,
  DshSessionHeader,
  DshWriterClaim,
} from '@smarteverything/domain';
import type { Store } from '../../../store/store';
import type { HostStore } from '../../../store/host/host-store';
import type { HarnessGrant } from '../../../harness/grant';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { DshSessionOpened } from '../../../store/repositories/dsh-sessions';
import type { DshSessionPrincipal } from '../../../store/repositories/dsh-session-claims';
import { addPersonMessage } from '../../store-units';
import { authorityScope, withAuthoritySource, type AuthorityScope } from '../../turn-authority';
import { issueEventAuthority } from '../../event-authority-issue';
import { durableStoreUnit } from '../../../store/host/unit';
import {
  assertHeldQueued,
  assertHeldSubagentCreation,
  type HeldChats,
} from '../../../store/repositories/ai-chat-removal-hold';
import { createHeld } from '../../../store/repositories/dsh-session-writes';
import type { NewChat } from '../../../store/repositories/ai-chat-input';

export interface NativeChildLaunch {
  readonly principal: DshSessionPrincipal;
  readonly attach: Pick<AiHarnessHost, 'runtime_instance' | 'connection_generation' | 'target'>;
  readonly header: DshSessionHeader;
  readonly inherited: number;
  readonly label: string;
  readonly task: string;
  readonly now: string;
}

export interface NativeChildProjection {
  readonly chat: AiChatRow;
  readonly run: AiAgentRun;
  readonly opened: DshSessionOpened;
}

export const UNNAMED_CHILD = 'Subagent';

export function childTitle(label: string, task: string): string {
  const line = label.trim() === '' ? (task.trim().split('\n')[0] ?? '') : label.trim();
  return line.slice(0, 60).trim() === '' ? UNNAMED_CHILD : line.slice(0, 60).trim();
}

function parentOf(store: HostStore, launch: NativeChildLaunch): AiChatRow {
  const parentSession = launch.header.parentSession;
  if (launch.header.origin !== 'subagent' || parentSession === undefined)
    throw new ApiError('invalid_request', 'A native child session must name its parent session.');
  const metadata = store.dshSessions.stat(parentSession, launch.principal.profile_id);
  if (metadata === undefined)
    throw new ApiError('not_found', 'The parent session of this native child is unknown.');
  const parent = store.aiChats.chat(metadata.chat_id);
  if (parent.engine.kind !== 'dsh')
    throw new ApiError(
      'conflict',
      'Only a conversation on the native harness has native children.',
    );
  return parent;
}

interface RunParts {
  readonly parent: AiChatRow;
  readonly child: AiChatRow;
  readonly event: StoredEvent;
  readonly launch: NativeChildLaunch;
  readonly opened: DshSessionOpened;
}

function harnessOf(parts: RunParts, engine: DshEngine): NonNullable<AiAgentRun['harness']> {
  return {
    session_id: parts.opened.claim.session_id,
    parent_session_id: DSH_SESSION_ID.parse(parts.launch.header.parentSession),
    target: parts.launch.attach.target,
    model_route_id: engine.model_route_id,
    permission: engine.permission,
    writer_epoch: parts.opened.claim.epoch,
  };
}

function runOf(parts: RunParts): AiAgentRun {
  const { parent, child, event, launch, opened } = parts;
  const engine = child.engine;
  if (engine.kind !== 'dsh') throw new Error('A native child chat lost its native engine.');
  return {
    id: event.id,
    parent_chat_id: parent.id,
    profile_id: parent.profile_id,
    source: 'smarteverything',
    source_id: event.id,
    parent_run_id: null,
    child_chat_id: child.id,
    device_id: engine.execution_target.kind === 'device' ? engine.execution_target.device_id : null,
    runtime: 'dsh',
    session_id: opened.claim.session_id,
    job_id: null,
    source_generation: null,
    source_seq: 1,
    source_revision: 0,
    title: child.title,
    task: launch.task === '' ? null : launch.task,
    state: 'running',
    last_known_state: null,
    observability_reason: null,
    progress: null,
    result: null,
    error: null,
    model: engine.model,
    effort: engine.effort,
    cwd: launch.header.cwd ?? null,
    started_at: launch.now,
    updated_at: launch.now,
    completed_at: null,
    usage: null,
    supported_actions: ['open_chat', 'send', 'interrupt'],
    truncated: false,
    harness: harnessOf(parts, engine),
  };
}

function taskEvent(
  ports: {
    readonly store: HostStore;
    readonly held: HeldChats;
  },
  parent: AiChatRow,
  chat: AiChatRow,
  task: string,
): StoredEvent {
  const { store, held } = ports;
  const hops = store.assistantEvents.currentHops(parent.id) + 1;
  const row =
    task === ''
      ? undefined
      : addPersonMessage(store, {
          chat,
          clientId: null,
          author: parent.title,
          text: task,
          files: [],
          origin: { source: 'chat', plugin_id: null, device_id: null, name: parent.title, hops },
        });
  assertHeldQueued(held, chat.id);
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat.id,
    message_id: row?.id ?? null,
    profile_id: parent.profile_id,
    client_id: null,
    text: task,
    report_to: parent.id,
    hops,
  });
  store.assistantEvents.mark(event.id, 'delivered_at');
  return event;
}

export function adoptNativeChild(
  store: HostStore,
  launch: NativeChildLaunch,
  held: HeldChats,
): NativeChildProjection {
  const parent = parentOf(store, launch);
  if (parent.engine.kind !== 'dsh') throw new Error('The parent lost its native engine.');
  const created: NewChat = {
    profileId: parent.profile_id,
    kind: 'subagent',
    title: childTitle(launch.label, launch.task),
    icon: null,
    parentId: parent.id,
    sourceKey: null,
    engine: { ...parent.engine, session_id: launch.header.id },
  };
  assertHeldSubagentCreation(held, created);
  const child = store.aiChats.create(created);
  const opened = createHeld(store.dshSessions, {
    input: {
      ...launch.attach,
      chat_id: child.id,
      header: launch.header,
      inherited_event_count: launch.inherited,
    },
    authority: launch.principal,
    held,
  });
  const event = taskEvent({ store, held }, parent, child, launch.task);
  const run = store.aiAgentRuns.upsert(runOf({ parent, child, event, launch, opened }));
  return { chat: child, run, opened };
}

export interface SubagentSessionCreate {
  readonly principal: DshSessionPrincipal;
  readonly parentClaim: DshWriterClaim;
  readonly parentGrant: HarnessGrant;
  readonly header: DshSessionHeader;
  readonly inherited: number;
  readonly now: string;
}

export interface SubagentSessionAdoption {
  readonly create: SubagentSessionCreate;
  readonly held: HeldChats;
  readonly scope: AuthorityScope;
}

function adoptedSubagentSession(
  store: HostStore,
  { create, held, scope }: SubagentSessionAdoption,
): NativeChildProjection {
  const { parentClaim, parentGrant, header } = create;
  const projection = adoptNativeChild(
    store,
    {
      principal: create.principal,
      attach: {
        target: parentClaim.target,
        runtime_instance: parentClaim.runtime_instance,
        connection_generation: parentClaim.connection_generation,
      },
      header,
      inherited: create.inherited,
      label: '',
      task: '',
      now: create.now,
    },
    held,
  );
  const task = store.assistantEvents.event(projection.run.source_id);
  const parentAuthority =
    parentGrant.event_id === null
      ? undefined
      : issueEventAuthority(store, store.assistantEvents.event(parentGrant.event_id), scope);
  issueEventAuthority(store, task, withAuthoritySource(scope, parentAuthority));
  const cwd = header.cwd ?? parentGrant.cwd;
  store.harnessSessions.issue({
    ...parentGrant,
    event_id: task.id,
    session_id: header.id,
    cwd,
  });
  projectChildOpening(store, projection.opened, parentGrant, cwd);
  return projection;
}

export const SUBAGENT_SESSION_ADOPT_UNIT = durableStoreUnit(adoptedSubagentSession);

export function adoptSubagentSession(
  store: Store,
  create: SubagentSessionCreate,
): Promise<NativeChildProjection> {
  return store.host.write('subagentSessionAdopt', {
    create,
    held: store.live.chatWork.holds.held(),
    scope: authorityScope(),
  });
}

function projectChildOpening(
  store: HostStore,
  opened: DshSessionOpened,
  grant: HarnessGrant,
  cwd: string,
): void {
  const { claim, metadata } = opened;
  store.harnessSessions.project(
    AI_HARNESS_SESSION.parse({
      chat_id: metadata.chat_id,
      session_id: claim.session_id,
      metadata,
      target: claim.target,
      epoch: claim.epoch,
      directory: { target: claim.target, path: cwd },
      permission: grant.permission,
      route: grant.route,
      state: 'idle',
      interactions: [],
      work: [],
      failure: null,
    }),
    0,
  );
}
