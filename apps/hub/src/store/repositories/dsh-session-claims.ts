import { z } from 'zod';
import {
  AI_HARNESS_TARGET_WRITE,
  DSH_SESSION_COMPOSITION_WRITE,
  DSH_WRITER_CLAIM,
  type DshSessionAcquire,
  type DshSessionComposition,
  type DshWriterClaim,
} from '@smarteverything/domain';
import type { StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';
import { DshSessionStorageError } from './dsh-session-errors';
import type { DshStoredSession } from './dsh-session-rows';
import { portableRestoreRevision } from './dsh-composition-identity';

export const DSH_SESSION_PRINCIPAL = z.strictObject({
  profile_id: z.uuid(),
  target: AI_HARNESS_TARGET_WRITE,
  runtime_instance: z.uuid(),
  connection_generation: z.uuid(),
  conversation_authorized: z.boolean(),
  platform: z.enum(['linux', 'windows', 'macos', 'android']),
  composition: DSH_SESSION_COMPOSITION_WRITE,
});
export type DshSessionPrincipal = z.infer<typeof DSH_SESSION_PRINCIPAL>;
const CLAIM_RECEIPT = z.strictObject({
  request: z.string(),
  claim: SQL_JSON.pipe(DSH_WRITER_CLAIM),
});

export function requireSessionActor(
  claim: Omit<DshWriterClaim, 'token' | 'epoch' | 'expires_at'>,
  principal: DshSessionPrincipal,
): void {
  if (!principal.conversation_authorized) {
    throw new DshSessionStorageError(
      claim.session_id,
      'forbidden',
      'the initiating profile has no authorized conversation execution grant',
    );
  }
  if (
    jsonText(claim.target) !== jsonText(principal.target) ||
    claim.runtime_instance !== principal.runtime_instance ||
    claim.connection_generation !== principal.connection_generation
  ) {
    throw new DshSessionStorageError(
      claim.session_id,
      'forbidden',
      'the authenticated execution host or connection does not match the writer',
    );
  }
}

export function requireSessionComposition(
  id: string,
  expected: DshSessionComposition,
  received: DshSessionComposition,
): void {
  if (
    expected.restore_revision === undefined ||
    received.restore_revision === undefined ||
    compositionIdentity(expected) !== compositionIdentity(received)
  ) {
    throw new DshSessionStorageError(
      id,
      'composition',
      'the execution host does not match the stored native composition',
    );
  }
}

function compositionIdentity(value: DshSessionComposition): string {
  return jsonText({
    dsh_version: value.dsh_version,
    session_format: value.session_format,
    preset: value.preset,
    restore_revision: portableRestoreRevision(value),
    event_vocabulary: [...value.event_vocabulary].sort(),
  });
}

export function requireWriter(
  row: DshStoredSession,
  claim: DshWriterClaim,
  principal: DshSessionPrincipal,
  now: string,
): DshWriterClaim {
  requireSessionActor(claim, principal);
  requireSessionComposition(row.session_id, row.composition, principal.composition);
  const current = row.claim;
  if (
    current === null ||
    row.claim_state !== 'active' ||
    Date.parse(current.expires_at) <= Date.parse(now)
  ) {
    throw new DshSessionStorageError(
      row.session_id,
      'ownership-lost',
      'the writer claim is no longer active',
    );
  }
  if (writerIdentity(current) !== writerIdentity(claim)) {
    throw new DshSessionStorageError(
      row.session_id,
      'ownership-lost',
      'the writer claim has been fenced by another host',
    );
  }
  return current;
}

export function writerIdentity(claim: DshWriterClaim): string {
  return jsonText({
    session_id: claim.session_id,
    target: claim.target,
    runtime_instance: claim.runtime_instance,
    connection_generation: claim.connection_generation,
    token: claim.token,
    epoch: claim.epoch,
  });
}

export class DshSessionClaims {
  constructor(private readonly context: StoreContext) {}

  acquire(
    row: DshStoredSession,
    request: DshSessionAcquire,
    principal: DshSessionPrincipal,
  ): DshWriterClaim {
    requireSessionActor(request, principal);
    requireSessionComposition(row.session_id, row.composition, principal.composition);
    const now = this.context.now();
    const receipt = this.retry(row, request, principal, now);
    if (receipt !== undefined) return receipt;
    if (
      row.claim !== null &&
      row.claim_state === 'active' &&
      Date.parse(row.claim.expires_at) > Date.parse(now)
    ) {
      throw new DshSessionStorageError(
        row.session_id,
        'already-owned',
        'another write handle owns this session',
      );
    }
    const claim = DSH_WRITER_CLAIM.parse({
      session_id: row.session_id,
      target: request.target,
      runtime_instance: request.runtime_instance,
      connection_generation: request.connection_generation,
      token: this.context.newId(),
      epoch: row.epoch + 1,
      expires_at: new Date(Date.parse(now) + request.lease_ms).toISOString(),
    });
    this.save(claim, request.operation_id);
    this.context.sql.run(
      'record native writer acquisition',
      'insert into dsh_session_claim_receipts(session_id,operation_id,request,claim) values($id,$operation,$request,$claim)',
      {
        id: row.session_id,
        operation: request.operation_id,
        request: jsonText(request),
        claim: jsonText(claim),
      },
    );
    return claim;
  }
  private retry(
    row: DshStoredSession,
    request: DshSessionAcquire,
    principal: DshSessionPrincipal,
    now: string,
  ): DshWriterClaim | undefined {
    const receipt = this.context.sql.get(
      CLAIM_RECEIPT,
      'select request,claim from dsh_session_claim_receipts where session_id=$id and operation_id=$operation',
      { id: row.session_id, operation: request.operation_id },
    );
    if (receipt === undefined) return undefined;
    if (receipt.request !== jsonText(request)) {
      throw new DshSessionStorageError(
        row.session_id,
        'receipt',
        'the claim operation was retried with different parameters',
      );
    }
    return requireWriter(row, receipt.claim, principal, now);
  }
  save(claim: DshWriterClaim, operationId: string): void {
    this.context.sql.run(
      'acquire native session ownership',
      "update dsh_sessions set claim=$claim,claim_state='active',epoch=$epoch,acquire_operation=$operation where session_id=$id",
      {
        claim: jsonText(claim),
        epoch: claim.epoch,
        operation: operationId,
        id: claim.session_id,
      },
    );
  }
}
