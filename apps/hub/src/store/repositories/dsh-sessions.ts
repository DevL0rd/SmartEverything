import { z } from 'zod';
import {
  AI_HARNESS_TARGET,
  DSH_SESSION_ID,
  DSH_SESSION_CREATE,
  DSH_SESSION_ACQUIRE,
  DSH_SESSION_APPEND,
  DSH_SESSION_EVENTS_WRITE,
  DSH_SESSION_FLUSH,
  DSH_SESSION_READ,
  DSH_SESSION_WORKSPACE,
  DSH_SESSION_WORKSPACE_CHOICE,
  DSH_WRITER_CLAIM_WRITE,
  type AiHarnessTarget,
  type DshSessionCreate,
  type DshSessionAppend,
  type DshSessionEvent,
  type DshSessionMetadata,
  type DshWriterClaim,
  type DshSessionPage,
  type DshSessionFlush,
  type DshSessionWorkspaceChoice,
} from '@smarteverything/domain';
import { found, type StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';
import { durableSessionWrite } from './dsh-session-durability';
import { assertChatWork } from './ai-chat-removal-hold';
import { DshSessionStorageError } from './dsh-session-errors';
import { requireNativeHeader } from './dsh-session-headers';
import { DshSessionEvents } from './dsh-session-events';
import { DshSessionRows, sessionMetadata, type DshStoredSession } from './dsh-session-rows';
import {
  DSH_SESSION_PRINCIPAL,
  DshSessionClaims,
  requireSessionActor,
  requireWriter,
  type DshSessionPrincipal,
} from './dsh-session-claims';

const CHAT = z.strictObject({ profile_id: z.uuid() });
const WORKSPACE = z
  .strictObject({
    target: SQL_JSON.pipe(AI_HARNESS_TARGET),
    cwd: z.string(),
    updated_at: z.string(),
  })
  .pipe(DSH_SESSION_WORKSPACE_CHOICE);
const PAGE_EVENTS = 10_000;
export interface DshSessionOpened {
  readonly metadata: DshSessionMetadata;
  readonly claim: DshWriterClaim;
}

export class DshSessionsRepository {
  private readonly rows: DshSessionRows;
  private readonly claims: DshSessionClaims;
  private readonly events: DshSessionEvents;
  private readonly appended = new Set<
    (sessionId: string, events: DshSessionAppend['events']) => void
  >();
  constructor(private readonly context: StoreContext) {
    this.rows = new DshSessionRows(context);
    this.claims = new DshSessionClaims(context);
    this.events = new DshSessionEvents(context);
  }

  create(input: unknown, authority: DshSessionPrincipal): DshSessionOpened {
    const request = DSH_SESSION_CREATE.parse(input);
    const principal = DSH_SESSION_PRINCIPAL.parse(authority);
    return durableSessionWrite(this.context, () => this.createStored(request, principal));
  }
  acquire(input: unknown, authority: DshSessionPrincipal): DshSessionOpened {
    const request = DSH_SESSION_ACQUIRE.parse(input);
    const principal = DSH_SESSION_PRINCIPAL.parse(authority);
    return durableSessionWrite(this.context, () => {
      const row = this.rows.get(request.session_id, principal.profile_id);
      assertChatWork(this.context, row.chat_id);
      return {
        metadata: sessionMetadata(row),
        claim: this.claims.acquire(row, request, principal),
      };
    });
  }
  append(input: unknown, authority: DshSessionPrincipal): DshSessionMetadata {
    const request = DSH_SESSION_APPEND.parse(input);
    const principal = DSH_SESSION_PRINCIPAL.parse(authority);
    const metadata = durableSessionWrite(this.context, () => {
      const row = this.rows.get(request.claim.session_id, principal.profile_id);
      requireWriter(row, request.claim, principal);
      return this.events.append(row, request);
    });
    this.announce(request.claim.session_id, request.events);
    return metadata;
  }
  rewrite(
    sessionId: string,
    profileId: string,
    events: readonly DshSessionEvent[],
  ): DshSessionMetadata {
    const id = DSH_SESSION_ID.parse(sessionId);
    const written = DSH_SESSION_EVENTS_WRITE.parse(events);
    const metadata = durableSessionWrite(this.context, () => {
      const row = this.rows.get(id, profileId);
      assertChatWork(this.context, row.chat_id);
      this.claims.detach(row);
      return this.events.write(row, written);
    });
    this.announce(id, written);
    return metadata;
  }
  onAppend(listener: (sessionId: string, events: DshSessionAppend['events']) => void): void {
    this.appended.add(listener);
  }
  flush(input: unknown, authority: DshSessionPrincipal): DshSessionMetadata {
    const request = DSH_SESSION_FLUSH.parse(input);
    const principal = DSH_SESSION_PRINCIPAL.parse(authority);
    return durableSessionWrite(this.context, () => {
      const row = this.rows.get(request.claim.session_id, principal.profile_id);
      requireWriter(row, request.claim, principal);
      requireDrainedPrefix(row, request);
      return sessionMetadata(row);
    });
  }
  detach(sessionId: string, profileId: string): void {
    durableSessionWrite(this.context, () => {
      this.claims.detach(this.rows.get(DSH_SESSION_ID.parse(sessionId), profileId));
    });
  }
  verifyWriter(input: unknown, authority: DshSessionPrincipal): DshWriterClaim {
    const claim = DSH_WRITER_CLAIM_WRITE.parse(input);
    const principal = DSH_SESSION_PRINCIPAL.parse(authority);
    const row = this.rows.get(claim.session_id, principal.profile_id);
    return requireWriter(row, claim, principal);
  }
  stat(sessionId: string, profileId: string): DshSessionMetadata | undefined {
    const row = this.rows.find(DSH_SESSION_ID.parse(sessionId));
    if (row === undefined) return undefined;
    this.rows.authorize(row, profileId);
    return sessionMetadata(row);
  }
  attached(sessionId: string, profileId: string): DshWriterClaim | null {
    return this.rows.get(DSH_SESSION_ID.parse(sessionId), profileId).claim;
  }
  list(profileId: string): DshSessionMetadata[] {
    return this.rows.list(profileId);
  }
  read(input: unknown, profileId: string): DshSessionPage {
    const request = DSH_SESSION_READ.parse(input);
    return this.context.sql.transaction(() =>
      this.events.read(this.rows.get(request.session_id, profileId), request),
    );
  }
  readAll(
    sessionId: string,
    profileId: string,
    range: { readonly offset?: number; readonly length?: number } = {},
  ): DshSessionPage['events'] {
    const id = DSH_SESSION_ID.parse(sessionId);
    const start = range.offset ?? 0;
    const end = range.length === undefined ? Infinity : start + range.length;
    const events: DshSessionPage['events'] = [];
    for (let offset = start; offset < end;) {
      const page = this.read(
        { session_id: id, offset, limit: Math.min(PAGE_EVENTS, end - offset) },
        profileId,
      );
      events.push(...page.events);
      if (page.next_offset === null) break;
      offset = page.next_offset;
    }
    return events;
  }
  workspaces(sessionId: string, profileId: string): DshSessionWorkspaceChoice[] {
    const id = DSH_SESSION_ID.parse(sessionId);
    this.rows.get(id, profileId);
    return this.context.sql.all(
      WORKSPACE,
      'select target,cwd,updated_at from dsh_session_workspaces where session_id=$id order by target_key',
      { id },
    );
  }
  workspace(
    sessionId: string,
    target: AiHarnessTarget,
    profileId: string,
  ): DshSessionWorkspaceChoice | undefined {
    const parsed = AI_HARNESS_TARGET.parse(target);
    return this.workspaces(sessionId, profileId).find(
      (choice) => jsonText(choice.target) === jsonText(parsed),
    );
  }
  saveWorkspace(input: unknown, authority: DshSessionPrincipal): DshSessionWorkspaceChoice {
    const request = DSH_SESSION_WORKSPACE.parse(input);
    const principal = DSH_SESSION_PRINCIPAL.parse(authority);
    return durableSessionWrite(this.context, () => {
      const row = this.rows.get(request.claim.session_id, principal.profile_id);
      requireWriter(row, request.claim, principal);
      const choice = DSH_SESSION_WORKSPACE_CHOICE.parse({
        target: request.claim.target,
        cwd: request.cwd,
        updated_at: this.context.now(),
      });
      this.context.sql.run(
        'remember this host native session workspace',
        'insert into dsh_session_workspaces(session_id,target_key,target,cwd,updated_at) values($id,$key,$target,$cwd,$now) on conflict(session_id,target_key) do update set cwd=excluded.cwd,updated_at=excluded.updated_at',
        {
          id: row.session_id,
          key: jsonText(choice.target),
          target: jsonText(choice.target),
          cwd: choice.cwd,
          now: choice.updated_at,
        },
      );
      return choice;
    });
  }
  private announce(sessionId: string, events: DshSessionAppend['events']): void {
    for (const listener of this.appended) listener(sessionId, events);
  }
  private createStored(
    request: DshSessionCreate,
    principal: DshSessionPrincipal,
  ): DshSessionOpened {
    requireNativeHeader(request.header, principal);
    const attach = DSH_SESSION_ACQUIRE.parse({
      target: request.target,
      runtime_instance: request.runtime_instance,
      connection_generation: request.connection_generation,
      session_id: request.header.id,
    });
    requireSessionActor(attach, principal);
    const chat = found(
      this.context.sql.get(CHAT, 'select profile_id from ai_chats where id=$id', {
        id: request.chat_id,
      }),
      'AI chat',
      request.chat_id,
    );
    if (chat.profile_id !== principal.profile_id)
      throw new DshSessionStorageError(
        request.header.id,
        'forbidden',
        'the chat belongs to a different profile',
      );
    assertChatWork(this.context, request.chat_id);
    let row = this.rows.find(request.header.id);
    if (row === undefined) {
      this.insert(request, principal);
      row = this.rows.get(request.header.id, principal.profile_id);
    } else this.rows.authorize(row, principal.profile_id);
    return {
      metadata: sessionMetadata(row),
      claim: this.claims.acquire(row, attach, principal),
    };
  }
  private insert(request: DshSessionCreate, principal: DshSessionPrincipal): void {
    this.context.sql.run(
      'create canonical native session',
      'insert into dsh_sessions(session_id,chat_id,profile_id,header,inherited_event_count,created_at) values($id,$chat,$profile,$header,$inherited,$now)',
      {
        id: request.header.id,
        chat: request.chat_id,
        profile: principal.profile_id,
        header: jsonText(request.header),
        inherited: request.inherited_event_count,
        now: this.context.now(),
      },
    );
  }
}

function requireDrainedPrefix(row: DshStoredSession, request: DshSessionFlush): void {
  if (row.next_seq !== request.expected_next_seq || row.inherited_event_count > row.next_seq) {
    throw new DshSessionStorageError(
      row.session_id,
      'sequence',
      `flush expected a complete prefix at ${String(request.expected_next_seq)}; stored ${String(row.next_seq)} with inherited cut ${String(row.inherited_event_count)}`,
    );
  }
}
