import { z } from 'zod';
import {
  AI_HARNESS_TARGET,
  DSH_SESSION_ID,
  DSH_SESSION_CREATE,
  DSH_SESSION_ACQUIRE,
  DSH_SESSION_APPEND,
  DSH_SESSION_FLUSH,
  DSH_SESSION_RELEASE,
  DSH_SESSION_RENEW,
  DSH_SESSION_READ,
  DSH_SESSION_WORKSPACE,
  DSH_SESSION_WORKSPACE_CHOICE,
  DSH_WRITER_CLAIM_WRITE,
  type AiHarnessTarget,
  type DshSessionCreate,
  type DshSessionAcquire,
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
  requireSessionComposition,
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
export interface DshSessionOpened {
  readonly metadata: DshSessionMetadata;
  readonly claim: DshWriterClaim;
}

export class DshSessionsRepository {
  private readonly rows: DshSessionRows;
  private readonly claims: DshSessionClaims;
  private readonly events: DshSessionEvents;
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
    return durableSessionWrite(this.context, () => {
      const row = this.rows.get(request.claim.session_id, principal.profile_id);
      requireWriter(row, request.claim, principal, this.context.now());
      return this.events.append(row, request);
    });
  }
  flush(input: unknown, authority: DshSessionPrincipal): DshSessionMetadata {
    const request = DSH_SESSION_FLUSH.parse(input);
    const principal = DSH_SESSION_PRINCIPAL.parse(authority);
    return durableSessionWrite(this.context, () => {
      const row = this.rows.get(request.claim.session_id, principal.profile_id);
      requireWriter(row, request.claim, principal, this.context.now());
      requireDrainedPrefix(row, request);
      return sessionMetadata(row);
    });
  }
  release(input: unknown, authority: DshSessionPrincipal): DshSessionMetadata {
    const request = DSH_SESSION_RELEASE.parse(input);
    const principal = DSH_SESSION_PRINCIPAL.parse(authority);
    return durableSessionWrite(this.context, () => {
      const row = this.rows.get(request.claim.session_id, principal.profile_id);
      requireSessionActor(request.claim, principal);
      const receipt = this.events.receipt(request);
      if (receipt !== undefined) return receipt;
      requireWriter(row, request.claim, principal, this.context.now());
      requireDrainedPrefix(row, request);
      this.context.sql.run(
        'release drained native session writer',
        "update dsh_sessions set claim_state='released' where session_id=$id",
        { id: row.session_id },
      );
      const metadata = sessionMetadata(row);
      this.events.keepReceipt(request, metadata);
      return metadata;
    });
  }
  renew(input: unknown, authority: DshSessionPrincipal): DshWriterClaim {
    const request = DSH_SESSION_RENEW.parse(input);
    const principal = DSH_SESSION_PRINCIPAL.parse(authority);
    return durableSessionWrite(this.context, () => {
      const row = this.rows.get(request.claim.session_id, principal.profile_id);
      const now = this.context.now();
      const current = requireWriter(row, request.claim, principal, now);
      const renewed = {
        ...current,
        expires_at: new Date(Date.parse(now) + request.lease_ms).toISOString(),
      };
      this.context.sql.run(
        'renew native writer lease',
        'update dsh_sessions set claim=$claim where session_id=$id',
        { claim: jsonText(renewed), id: row.session_id },
      );
      return renewed;
    });
  }
  verifyWriter(input: unknown, authority: DshSessionPrincipal): DshWriterClaim {
    const claim = DSH_WRITER_CLAIM_WRITE.parse(input);
    const principal = DSH_SESSION_PRINCIPAL.parse(authority);
    const row = this.rows.get(claim.session_id, principal.profile_id);
    return requireWriter(row, claim, principal, this.context.now());
  }
  stat(sessionId: string, profileId: string): DshSessionMetadata | undefined {
    const row = this.rows.find(DSH_SESSION_ID.parse(sessionId));
    if (row === undefined) return undefined;
    this.rows.authorize(row, profileId);
    return sessionMetadata(row);
  }
  writerState(
    sessionId: string,
    profileId: string,
  ): { readonly claim: DshWriterClaim | null; readonly state: 'active' | 'released' | null } {
    const row = this.rows.get(DSH_SESSION_ID.parse(sessionId), profileId);
    return { claim: row.claim, state: row.claim_state };
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
      requireWriter(row, request.claim, principal, this.context.now());
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
  private createStored(
    request: DshSessionCreate,
    principal: DshSessionPrincipal,
  ): DshSessionOpened {
    requireNativeHeader(request.header, principal);
    const acquisition = creationAcquisition(request);
    requireSessionActor(acquisition, principal);
    requireSessionComposition(request.header.id, request.composition, principal.composition);
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
    } else {
      this.rows.authorize(row, principal.profile_id);
      if (row.creation_request !== jsonText(request))
        throw new DshSessionStorageError(
          row.session_id,
          'already-exists',
          'the session already exists with different creation parameters',
        );
    }
    return {
      metadata: sessionMetadata(row),
      claim: this.claims.acquire(row, acquisition, principal),
    };
  }
  private insert(request: DshSessionCreate, principal: DshSessionPrincipal): void {
    this.context.sql.run(
      'create canonical native session',
      'insert into dsh_sessions(session_id,chat_id,profile_id,header,composition,inherited_event_count,creation_request,created_at) values($id,$chat,$profile,$header,$composition,$inherited,$request,$now)',
      {
        id: request.header.id,
        chat: request.chat_id,
        profile: principal.profile_id,
        header: jsonText(request.header),
        composition: jsonText(request.composition),
        inherited: request.inherited_event_count,
        request: jsonText(request),
        now: this.context.now(),
      },
    );
  }
}

function creationAcquisition(request: DshSessionCreate): DshSessionAcquire {
  return DSH_SESSION_ACQUIRE.parse({
    session_id: request.header.id,
    target: request.target,
    runtime_instance: request.runtime_instance,
    connection_generation: request.connection_generation,
    operation_id: request.operation_id,
    lease_ms: request.lease_ms,
  });
}

function requireDrainedPrefix(row: DshStoredSession, request: DshSessionFlush): void {
  if (row.next_seq !== request.expected_next_seq || row.inherited_event_count > row.next_seq) {
    throw new DshSessionStorageError(
      row.session_id,
      'sequence',
      `flush/release expected a complete prefix at ${String(request.expected_next_seq)}; stored ${String(row.next_seq)} with inherited cut ${String(row.inherited_event_count)}`,
    );
  }
}
