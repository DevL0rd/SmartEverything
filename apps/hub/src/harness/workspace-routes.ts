import {
  API_ENDPOINTS,
  AI_WORKSPACE,
  DELIVERABLES_PRESENTED_DATA,
  DELIVERABLES_PRESENTED_EVENT,
  WORKSPACE_CHANGES_RECORD,
  WORKSPACE_CHANGES_RECORD_DATA,
  WORKSPACE_STATE_RECORD,
  WORKSPACE_STATE_RECORD_DATA,
} from '@smarteverything/domain';
import type {
  AiWorkspace,
  AiWorkspaceDeliverable,
  AiWorkspaceDiff,
  AiWorkspaceFile,
  AiWorkspaceGit,
  AiHarnessTarget,
  AiWorkspaceTurn,
  DshSessionEvent,
  DshSessionMetadata,
  WorkspaceChangesRecordData,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { bound } from '../server/router';
import { chatOwnerOf } from '../server/auth';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessService } from './service';

const log = new Logger('hub.harness');

export interface SessionLog {
  readonly chatId: string;
  readonly profileId: string;
  readonly sessionId: string;
  readonly onHub: boolean;
  readonly metadata: DshSessionMetadata;
  readonly events: readonly DshSessionEvent[];
}

export interface ChatRef {
  readonly id: string;
  readonly profile_id: string;
}

export interface ChatSessionSource {
  own(owner: ChatOwner, chatId: string): ChatRef;
  binding(chat: ChatRef): {
    readonly session_id: string | null;
    readonly execution_target: AiHarnessTarget;
  };
  readonly store: {
    readonly dshSessions: {
      stat(sessionId: string, profileId: string): DshSessionMetadata | undefined;
      readAll(sessionId: string, profileId: string): readonly DshSessionEvent[];
    };
  };
}

export function sessionLogOf(
  service: ChatSessionSource,
  owner: ChatOwner,
  chatId: string,
): SessionLog | null {
  const chat = service.own(owner, chatId);
  const binding = service.binding(chat);
  if (binding.session_id === null) return null;
  const metadata = service.store.dshSessions.stat(binding.session_id, chat.profile_id);
  if (metadata === undefined) return null;
  return {
    chatId: chat.id,
    profileId: chat.profile_id,
    sessionId: binding.session_id,
    onHub: binding.execution_target.kind === 'server',
    metadata,
    events: service.store.dshSessions.readAll(binding.session_id, chat.profile_id),
  };
}

export interface StoredOutFile {
  readonly id: string;
}

export interface DeliveryPorts {
  readonly fromOutFile: (
    profileId: string,
    file: { readonly path: string },
    scope: { readonly local: boolean; readonly chatId: string; readonly authorize: () => void },
  ) => Promise<StoredOutFile>;
  readonly authorize: (chatId: string) => () => void;
}

export class DeliverableProjector {
  private readonly stored = new Map<string, string>();

  constructor(private readonly ports: DeliveryPorts) {}

  attachmentOf(sessionId: string, key: string): string | null {
    return this.stored.get(`${sessionId}:${key}`) ?? null;
  }

  async project(session: SessionLog): Promise<void> {
    if (!session.onHub) return;
    for (const declared of presentedOf(session.events))
      for (const [index, file] of declared.files.entries()) {
        const key = `${session.sessionId}:${deliveryKey(declared.seq, index)}`;
        if (this.stored.has(key)) continue;
        await this.store(session, key, file.path);
      }
  }

  private async store(session: SessionLog, key: string, path: string): Promise<void> {
    try {
      const attachment = await this.ports.fromOutFile(
        session.profileId,
        { path },
        {
          local: true,
          chatId: session.chatId,
          authorize: this.ports.authorize(session.chatId),
        },
      );
      this.stored.set(key, attachment.id);
    } catch (cause) {
      log.warn('harness.deliverable_not_stored', {
        chatId: session.chatId,
        sessionId: session.sessionId,
        path,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
}

interface Declared {
  readonly seq: number;
  readonly turn: number;
  readonly callId: string;
  readonly files: readonly { readonly path: string; readonly description: string | null }[];
}

function deliveryKey(seq: number, index: number): string {
  return `${String(seq)}:${String(index)}`;
}

function presentedOf(events: readonly DshSessionEvent[]): readonly Declared[] {
  return events.flatMap((event) => {
    if (event.type !== DELIVERABLES_PRESENTED_EVENT) return [];
    const parsed = DELIVERABLES_PRESENTED_DATA.safeParse(event.data);
    if (!parsed.success) {
      log.error('harness.deliverable_invalid', parsed.error, { seq: event.seq });
      return [];
    }
    return [
      {
        seq: event.seq,
        turn: parsed.data.turn,
        callId: parsed.data.callId,
        files: parsed.data.files.map((file) => ({
          path: file.path,
          description: file.description ?? null,
        })),
      },
    ];
  });
}

function diffOf(
  diff: NonNullable<WorkspaceChangesRecordData['files'][number]['diff']>,
): AiWorkspaceDiff {
  if (diff.kind !== 'text') return { kind: diff.kind };
  return {
    kind: 'text',
    before: diff.before,
    after: diff.after,
    coarse: diff.coarse,
    hunks: diff.hunks.map((hunk) => ({
      old_start: hunk.oldStart,
      old_lines: hunk.oldLines,
      new_start: hunk.newStart,
      new_lines: hunk.newLines,
      lines: hunk.lines,
    })),
  };
}

function fileOf(file: WorkspaceChangesRecordData['files'][number]): AiWorkspaceFile {
  return {
    path: file.path,
    display: file.display,
    added: file.added,
    deleted: file.deleted,
    binary: file.binary === true,
    oversized: file.oversized === true,
    diff: file.diff === null ? null : diffOf(file.diff),
  };
}

function turnOf(record: WorkspaceChangesRecordData): AiWorkspaceTurn {
  return {
    turn: record.turn,
    cwd: record.cwd,
    files: record.files.map(fileOf),
    total: record.total,
    added: record.added,
    deleted: record.deleted,
  };
}

function gitOf(events: readonly DshSessionEvent[]): AiWorkspaceGit {
  let git: AiWorkspaceGit = 'unknown';
  for (const event of events) {
    if (event.type !== WORKSPACE_STATE_RECORD) continue;
    const parsed = WORKSPACE_STATE_RECORD_DATA.safeParse(event.data);
    if (parsed.success) git = parsed.data.git;
    else log.error('harness.workspace_state_invalid', parsed.error, { seq: event.seq });
  }
  return git;
}

function turnsOf(events: readonly DshSessionEvent[]): readonly AiWorkspaceTurn[] {
  const latest = new Map<number, WorkspaceChangesRecordData>();
  for (const event of events) {
    if (event.type !== WORKSPACE_CHANGES_RECORD) continue;
    const parsed = WORKSPACE_CHANGES_RECORD_DATA.safeParse(event.data);
    if (parsed.success) latest.set(parsed.data.turn, parsed.data);
    else log.error('harness.workspace_changes_invalid', parsed.error, { seq: event.seq });
  }
  return [...latest.values()].sort((a, b) => a.turn - b.turn).map(turnOf);
}

export function workspaceOf(
  session: SessionLog,
  attachmentOf: (key: string) => string | null,
): AiWorkspace {
  const deliverables: AiWorkspaceDeliverable[] = presentedOf(session.events).flatMap((declared) =>
    declared.files.map((file, index) => ({
      turn: declared.turn,
      call_id: declared.callId,
      path: file.path,
      description: file.description,
      attachment_id: attachmentOf(deliveryKey(declared.seq, index)),
    })),
  );
  return AI_WORKSPACE.parse({
    git: gitOf(session.events),
    turns: turnsOf(session.events),
    deliverables,
  });
}

export const NO_WORKSPACE: AiWorkspace = { git: 'unknown', turns: [], deliverables: [] };

export async function readWorkspace(
  service: ChatSessionSource,
  projector: DeliverableProjector,
  owner: ChatOwner,
  chatId: string,
): Promise<AiWorkspace> {
  const session = sessionLogOf(service, owner, chatId);
  if (session === null) return NO_WORKSPACE;
  await projector.project(session);
  return workspaceOf(session, (key) => projector.attachmentOf(session.sessionId, key));
}

export const workspaceRoutes = (service: HarnessService, projector: DeliverableProjector) =>
  ({
    readAiChatWorkspace: bound(API_ENDPOINTS.readAiChatWorkspace, ({ params, caller }) =>
      readWorkspace(service, projector, chatOwnerOf(service.store, caller), params.chatId),
    ),
  }) as const;
