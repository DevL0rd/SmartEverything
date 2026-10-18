import { writerIdentity } from './dsh-session-claims';
import { HARNESS_GRANT } from '../../harness/grant';
import type { HarnessGrant } from '../../harness/grant';
import { z } from 'zod';
import {
  AI_HARNESS_SESSION,
  ApiError,
  DSH_WRITER_CLAIM,
  AI_HARNESS_PERMISSION_CHANGE,
} from '@smarteverything/domain';
import type {
  AiHarnessSession,
  DshWriterClaim,
  AiHarnessFailure,
  AiHarnessEvent,
  AiHarnessPermission,
  AiHarnessPermissionChange,
} from '@smarteverything/domain';
import { SQL_JSON, jsonText } from '../sql';
import type { StoreContext } from '../context';
import { durableSessionWrite } from './dsh-session-durability';
import { trackPending } from './ai-chat-pending';

export { HARNESS_GRANT } from '../../harness/grant';
export type { HarnessGrant } from '../../harness/grant';
const GRANT_ROW = z.object({ grant: SQL_JSON.pipe(HARNESS_GRANT) });
const STATE = z.object({ projection: SQL_JSON.pipe(AI_HARNESS_SESSION), event_seq: z.int() });
const RECEIPT = z.object({
  session_id: z.string(),
  request: z.string(),
  result: z.string().nullable(),
  state: z.enum(['pending', 'completed', 'unknown']),
});
export class HarnessCoordinationRepository {
  constructor(private readonly context: StoreContext) {}
  grant(id: string): HarnessGrant | undefined {
    const row = this.context.sql.get(
      GRANT_ROW,
      "select json_object('session_id',session_id,'profile_id',profile_id,'target',json(target),'runtime_instance',runtime_instance,'generation',generation,'authority',json(authority),'route',json(route),'permission',json(permission),'cwd',cwd,'client_id',client_id,'role',role,'event_id',event_id) as grant from harness_grants where session_id=$id",
      { id },
    );
    return row?.grant;
  }
  issue(input: z.input<typeof HARNESS_GRANT>): void {
    const grant = HARNESS_GRANT.parse(input);
    durableSessionWrite(this.context, () =>
      this.context.sql.run(
        'issue native execution grant',
        'insert into harness_grants(session_id,profile_id,target,runtime_instance,generation,authority,route,permission,cwd,client_id,role,event_id) values($id,$profile,$target,$instance,$generation,$authority,$route,$permission,$cwd,$client,$role,$event) on conflict(session_id) do update set target=excluded.target,runtime_instance=excluded.runtime_instance,generation=excluded.generation,authority=excluded.authority,route=excluded.route,permission=excluded.permission,cwd=excluded.cwd,client_id=excluded.client_id,role=excluded.role,event_id=excluded.event_id',
        {
          client: grant.client_id,
          event: grant.event_id,
          role: grant.role,
          id: grant.session_id,
          profile: grant.profile_id,
          target: jsonText(grant.target),
          instance: grant.runtime_instance,
          generation: grant.generation,
          authority: jsonText(grant.authority),
          route: jsonText(grant.route),
          permission: jsonText(grant.permission),
          cwd: grant.cwd,
        },
      ),
    );
  }
  state(id: string): AiHarnessSession | undefined {
    return this.context.sql.get(
      STATE,
      'select projection,event_seq from harness_projections where session_id=$id',
      { id },
    )?.projection;
  }
  switchingSessions(): string[] {
    return this.context.sql
      .all(
        z.object({ session_id: z.string() }),
        "select session_id from harness_projections where json_extract(projection,'$.state')='switching'",
      )
      .map((row) => row.session_id);
  }
  admitContextRequest(
    claim: DshWriterClaim,
    request: NonNullable<AiHarnessSession['context_request']>,
  ): void {
    durableSessionWrite(this.context, () => {
      if (!this.currentContextWriter(claim))
        throw new ApiError('conflict', 'Ordinary context request has no current admitted writer.');
      const session = this.state(claim.session_id);
      if (session?.epoch !== claim.epoch || request.epoch !== claim.epoch)
        throw new ApiError(
          'conflict',
          'Ordinary context request has no current native projection.',
        );
      const updated = AI_HARNESS_SESSION.parse({
        ...session,
        context_request: request,
      });
      this.context.sql.run(
        'admit ordinary context measurement request',
        'update harness_projections set projection=$projection where session_id=$id',
        { id: claim.session_id, projection: jsonText(updated) },
      );
    });
  }
  currentContextRequest(claim: DshWriterClaim, requestId: string): boolean {
    const request = this.state(claim.session_id)?.context_request;
    return (
      request?.id === requestId && request.epoch === claim.epoch && this.currentContextWriter(claim)
    );
  }
  private currentContextWriter(claim: DshWriterClaim): boolean {
    const writer = this.context.sql.get(
      z.object({ claim: SQL_JSON.pipe(DSH_WRITER_CLAIM).nullable() }),
      'select claim from dsh_sessions where session_id=$id',
      { id: claim.session_id },
    );
    const current = writer?.claim ?? null;
    return current !== null && writerIdentity(current) === writerIdentity(claim);
  }
  noteContext(id: string, context: NonNullable<AiHarnessSession['context']>): void {
    durableSessionWrite(this.context, () => {
      const session = this.state(id);
      if (session === undefined)
        throw new ApiError('conflict', 'Measured context has no retained native projection.');
      const updated = AI_HARNESS_SESSION.parse({ ...session, context });
      this.context.sql.run(
        'retain measured native request context',
        'update harness_projections set projection=$projection where session_id=$id',
        { id, projection: jsonText(updated) },
      );
    });
  }
  project(input: AiHarnessSession, eventSeq: number): boolean {
    return durableSessionWrite(this.context, () => this.projectStored(input, eventSeq));
  }
  accept(
    input: AiHarnessSession,
    event: AiHarnessEvent,
    keep: () => void,
    permission?: AiHarnessPermissionChange,
  ): boolean {
    return durableSessionWrite(this.context, () => {
      if (permission !== undefined) {
        this.permissionStored(input.session_id, permission.permission);
        this.finishStored(permission.operation_id, input);
      }
      keep();
      return this.projectStored(input, event.seq + 1);
    });
  }
  permissionChange(id: string): AiHarnessPermissionChange | null {
    return (
      this.context.sql.get(
        z.object({ request: SQL_JSON.pipe(AI_HARNESS_PERMISSION_CHANGE) }),
        "select json_remove(request,'$.kind','$.native_from_seq') as request from harness_operations where session_id=$id and state='pending' and json_extract(request,'$.kind')='permission' limit 1",
        { id },
      )?.request ?? null
    );
  }
  operation(id: string): z.infer<typeof RECEIPT> | undefined {
    return this.context.sql.get(
      RECEIPT,
      'select session_id,request,result,state from harness_operations where operation_id=$id',
      { id },
    );
  }
  recoverPermission(
    session: AiHarnessSession,
    operation: AiHarnessPermissionChange,
    updateChat: () => void,
  ): void {
    durableSessionWrite(this.context, () => {
      this.permissionStored(session.session_id, operation.permission);
      this.finishStored(operation.operation_id, session);
      trackPending(this.context, session.chat_id, () =>
        this.context.sql.run(
          'reconcile native permission projection',
          'update harness_projections set projection=$projection where session_id=$id',
          { id: session.session_id, projection: jsonText(session) },
        ),
      );
      updateChat();
    });
  }
  private permissionStored(id: string, permission: AiHarnessPermission): void {
    this.context.sql.run(
      'record confirmed native permission',
      'update harness_grants set permission=$permission where session_id=$id',
      { id, permission: jsonText(permission) },
    );
  }
  private projectStored(input: AiHarnessSession, eventSeq: number): boolean {
    const session = AI_HARNESS_SESSION.parse(input);
    const current = this.context.sql.get(
      STATE,
      'select projection,event_seq from harness_projections where session_id=$id',
      { id: session.session_id },
    );
    if (current?.projection.epoch === session.epoch && current.event_seq >= eventSeq) return false;
    trackPending(this.context, session.chat_id, () =>
      this.context.sql.run(
        'persist shared native session projection',
        'insert into harness_projections(session_id,projection,event_seq) values($id,$projection,$seq) on conflict(session_id) do update set projection=excluded.projection,event_seq=excluded.event_seq',
        { id: session.session_id, projection: jsonText(session), seq: eventSeq },
      ),
    );
    return true;
  }
  sender(sessionId: string, clientId: string | null): void {
    durableSessionWrite(this.context, () =>
      this.context.sql.run(
        'record the device that sent the current turn',
        'update harness_grants set client_id = $client where session_id = $id',
        { client: clientId, id: sessionId },
      ),
    );
  }
  markSwitching(sessionId: string): void {
    this.writeState(sessionId, 'switching', null);
  }
  settleSwitching(sessionId: string, failure: AiHarnessFailure | null): void {
    this.writeState(sessionId, failure === null ? 'idle' : 'failed', failure);
  }
  private writeState(
    sessionId: string,
    state: AiHarnessSession['state'],
    failure: AiHarnessFailure | null,
  ): void {
    durableSessionWrite(this.context, () => {
      const current = this.state(sessionId);
      if (current === undefined)
        throw new Error('Native machine change has no durable shared projection.');
      const projection = AI_HARNESS_SESSION.parse({ ...current, state, failure });
      this.context.sql.run(
        'persist native machine change state',
        'update harness_projections set projection=$state where session_id=$id',
        { state: jsonText(projection), id: sessionId },
      );
    });
  }
  begin(operationId: string, sessionId: string, request: unknown): z.infer<typeof RECEIPT> {
    return durableSessionWrite(this.context, () => {
      const signature = jsonText(request);
      const prior = this.context.sql.get(
        RECEIPT,
        'select session_id,request,result,state from harness_operations where operation_id=$id',
        { id: operationId },
      );
      if (prior !== undefined) {
        if (prior.session_id !== sessionId || prior.request !== signature)
          throw new HarnessOperationCollision(operationId);
        return prior;
      }
      this.context.sql.run(
        'record native operation admission',
        "insert into harness_operations(operation_id,session_id,request,state) values($id,$session,$request,'pending')",
        { id: operationId, session: sessionId, request: signature },
      );
      return { session_id: sessionId, request: signature, result: null, state: 'pending' };
    });
  }
  finish(operationId: string, result: unknown, state: 'completed' | 'unknown' = 'completed'): void {
    durableSessionWrite(this.context, () => {
      this.finishStored(operationId, result, state);
    });
  }
  private finishStored(
    operationId: string,
    result: unknown,
    state: 'completed' | 'unknown' = 'completed',
  ): void {
    this.context.sql.run(
      'settle native operation receipt',
      'update harness_operations set result=$result,state=$state where operation_id=$id',
      { id: operationId, result: jsonText(result), state },
    );
  }
}
class HarnessOperationCollision extends Error {
  override readonly name = 'HarnessOperationCollision';
  constructor(readonly operationId: string) {
    super('A native operation identity was reused with different input.');
  }
}
