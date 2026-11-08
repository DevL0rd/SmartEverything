import { randomUUID } from 'node:crypto';
import { z } from 'zod';
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
import type { HarnessGrant } from '../../../harness/grant';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { DshSessionOpened } from '../../../store/repositories/dsh-sessions';
import type { DshSessionPrincipal } from '../../../store/repositories/dsh-session-claims';
import type { ConversationLog } from '../../conversation-log';
import { eventAuthority } from '../../turn-authority';
import { projectNativeChildTask, touchNativeChild } from './children-live';
import { NativeTranscripts } from './transcript';
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

const UNNAMED_CHILD = 'Subagent';

function childTitle(label: string, task: string): string {
  const line = label.trim() === '' ? (task.trim().split('\n')[0] ?? '') : label.trim();
  return line.slice(0, 60).trim() === '' ? UNNAMED_CHILD : line.slice(0, 60).trim();
}

function parentOf(store: Store, launch: NativeChildLaunch): AiChatRow {
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
  ports: { readonly store: Store; readonly conversation: ConversationLog },
  parent: AiChatRow,
  chat: AiChatRow,
  task: string,
): StoredEvent {
  const { store, conversation } = ports;
  const hops = store.assistantEvents.currentHops(parent.id) + 1;
  const row =
    task === ''
      ? undefined
      : conversation.person({
          chat,
          clientId: null,
          author: parent.title,
          text: task,
          files: [],
          origin: { source: 'chat', plugin_id: null, device_id: null, name: parent.title, hops },
        });
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
  store: Store,
  conversation: ConversationLog,
  launch: NativeChildLaunch,
): NativeChildProjection {
  return store.durableWrite(() => {
    const parent = parentOf(store, launch);
    if (parent.engine.kind !== 'dsh') throw new Error('The parent lost its native engine.');
    const child = store.aiChats.create({
      profileId: parent.profile_id,
      kind: 'subagent',
      title: childTitle(launch.label, launch.task),
      icon: null,
      parentId: parent.id,
      sourceKey: null,
      engine: { ...parent.engine, session_id: launch.header.id },
    });
    const opened = store.dshSessions.create(
      {
        ...launch.attach,
        chat_id: child.id,
        header: launch.header,
        inherited_event_count: launch.inherited,
      },
      launch.principal,
    );
    const event = taskEvent({ store, conversation }, parent, child, launch.task);
    const run = store.aiAgentRuns.upsert(runOf({ parent, child, event, launch, opened }));
    return { chat: child, run, opened };
  });
}

export interface SubagentSessionCreate {
  readonly principal: DshSessionPrincipal;
  readonly parentClaim: DshWriterClaim;
  readonly parentGrant: HarnessGrant;
  readonly header: DshSessionHeader;
  readonly inherited: number;
  readonly now: string;
}

export function adoptSubagentSession(
  store: Store,
  conversation: ConversationLog,
  create: SubagentSessionCreate,
): NativeChildProjection {
  const { parentClaim, parentGrant, header } = create;
  return store.durableWrite(() => {
    const projection = adoptNativeChild(store, conversation, {
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
    });
    const task = store.assistantEvents.event(projection.run.source_id);
    const parentAuthority =
      parentGrant.event_id === null
        ? undefined
        : eventAuthority(store, store.assistantEvents.event(parentGrant.event_id));
    eventAuthority(store, task, parentAuthority);
    const cwd = header.cwd ?? parentGrant.cwd;
    store.harnessSessions.issue({
      ...parentGrant,
      event_id: task.id,
      session_id: header.id,
      cwd,
    });
    projectChildOpening(store, projection.opened, parentGrant, cwd);
    return projection;
  });
}

function projectChildOpening(
  store: Store,
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

const TURN_END = z.object({ reason: z.object({ kind: z.string() }) });
const ASSISTANT = z.object({ message: z.object({ content: z.array(z.unknown()) }) });
const TEXT_BLOCK = z.object({ type: z.literal('text'), text: z.string() });

interface FoldedEvent {
  readonly type: string;
  readonly data: unknown;
}

type SessionEvents = readonly FoldedEvent[];

function textOf(content: readonly unknown[]): string {
  return content
    .flatMap((block) => {
      const text = TEXT_BLOCK.safeParse(block);
      return text.success ? [text.data.text] : [];
    })
    .join('');
}

export function lastAssistantText(events: SessionEvents): string {
  for (const event of events.toReversed()) {
    if (event.type !== 'assistant/message') continue;
    const message = ASSISTANT.safeParse(event.data);
    const text = message.success ? textOf(message.data.message.content) : '';
    if (text !== '') return text;
  }
  return '';
}

export interface NativeChildOutcome {
  readonly state: Extract<AiAgentRun['state'], 'completed' | 'interrupted' | 'failed'>;
  readonly kind: string;
}

export function nativeChildOutcome(events: SessionEvents): NativeChildOutcome | undefined {
  for (const event of events.toReversed()) {
    if (event.type !== 'turn/end') continue;
    const end = TURN_END.safeParse(event.data);
    if (!end.success) continue;
    const { kind } = end.data.reason;
    return {
      kind,
      state: kind === 'completed' ? 'completed' : kind === 'aborted' ? 'interrupted' : 'failed',
    };
  }
  return undefined;
}

export function settleNativeChild(
  store: Store,
  sessionId: string,
  appended: SessionEvents,
  now: string,
): AiAgentRun | undefined {
  const outcome = nativeChildOutcome(appended);
  if (outcome === undefined) return undefined;
  const run = store.aiAgentRuns.currentOfSession(sessionId);
  if (run?.completed_at !== null) return undefined;
  const text = lastAssistantText(store.dshSessions.readAll(sessionId, run.profile_id));
  store.assistantEvents.mark(run.source_id, 'answered_at');
  return store.aiAgentRuns.upsert({
    ...run,
    state: outcome.state,
    result: outcome.state === 'completed' ? text : run.result,
    error: outcome.state === 'failed' ? `The helper ended: ${outcome.kind}.` : null,
    updated_at: now,
    completed_at: now,
    source_seq: run.source_seq + 1,
    supported_actions: ['open_chat', 'delete'],
  });
}

const DESCRIPTOR = z.object({
  type: z.literal('subagent/descriptor'),
  data: z.object({ label: z.string().min(1) }),
});
const FIRST_TASK = z.object({
  type: z.literal('user/message'),
  data: z.object({ content: z.array(z.unknown()) }),
});

function describedLabel(events: SessionEvents): string | undefined {
  for (const event of events) {
    const descriptor = DESCRIPTOR.safeParse(event);
    if (descriptor.success) return descriptor.data.data.label;
  }
  return undefined;
}

function describedTask(events: SessionEvents): string | undefined {
  for (const event of events) {
    const message = FIRST_TASK.safeParse(event);
    const text = message.success ? textOf(message.data.data.content) : '';
    if (text !== '') return text;
  }
  return undefined;
}

function describedTitle(
  run: AiAgentRun,
  label: string | undefined,
  task: string | undefined,
): string {
  if (label === undefined && run.title !== UNNAMED_CHILD) return run.title;
  return childTitle(label ?? '', task ?? run.task ?? '');
}

export function describeNativeChild(
  store: Store,
  sessionId: string,
  appended: SessionEvents,
): AiAgentRun | undefined {
  const run = store.aiAgentRuns.currentOfSession(sessionId);
  if (run?.completed_at !== null || run.child_chat_id === null) return undefined;
  const label = describedLabel(appended);
  const task = run.task === null ? describedTask(appended) : undefined;
  if (label === undefined && task === undefined) return undefined;
  const title = describedTitle(run, label, task);
  if (title !== run.title) store.aiChats.update(run.child_chat_id, { title });
  return store.aiAgentRuns.upsert({
    ...run,
    title,
    task: task ?? run.task,
    source_seq: run.source_seq + 1,
  });
}

function settleChildTask(store: Store, conversation: ConversationLog, run: AiAgentRun): void {
  const taskId = store.assistantEvents.event(run.source_id).message_id;
  if (run.state === 'failed')
    conversation.failedMessage(taskId, run.error ?? 'The helper ended.', 'unknown');
  else conversation.stateOf(taskId, 'answered');
}

export function watchNativeSessions(
  store: Store,
  conversation: ConversationLog,
  now: () => Date,
): void {
  const transcripts = new NativeTranscripts(store, conversation);
  store.dshSessions.onAppend((sessionId, events, write) => {
    const at = now().toISOString();
    projectNativeChildTask({ store, conversation }, sessionId, events);
    if (write === 'append') transcripts.appended(sessionId, events);
    touchNativeChild(store, sessionId, events);
    describeNativeChild(store, sessionId, events);
    const settled = settleNativeChild(store, sessionId, events, at);
    if (settled !== undefined) settleChildTask(store, conversation, settled);
  });
}
