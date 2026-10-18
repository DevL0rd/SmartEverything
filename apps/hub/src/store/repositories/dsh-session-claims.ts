import { z } from 'zod';
import {
  AI_HARNESS_TARGET_WRITE,
  DSH_WRITER_CLAIM,
  type DshSessionAcquire,
  type DshWriterClaim,
} from '@smarteverything/domain';
import type { StoreContext } from '../context';
import { jsonText } from '../sql';
import { DshSessionStorageError } from './dsh-session-errors';
import type { DshStoredSession } from './dsh-session-rows';

export const DSH_SESSION_PRINCIPAL = z.strictObject({
  profile_id: z.uuid(),
  target: AI_HARNESS_TARGET_WRITE,
  runtime_instance: z.uuid(),
  connection_generation: z.uuid(),
  platform: z.enum(['linux', 'windows', 'macos', 'android']),
});
export type DshSessionPrincipal = z.infer<typeof DSH_SESSION_PRINCIPAL>;

export function requireSessionActor(
  claim: Omit<DshWriterClaim, 'epoch'>,
  principal: DshSessionPrincipal,
): void {
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

export function requireWriter(
  row: DshStoredSession,
  claim: DshWriterClaim,
  principal: DshSessionPrincipal,
): DshWriterClaim {
  requireSessionActor(claim, principal);
  const current = row.claim;
  if (current === null) {
    throw new DshSessionStorageError(
      row.session_id,
      'ownership-lost',
      'the session is not attached to a machine',
    );
  }
  if (writerIdentity(current) !== writerIdentity(claim)) {
    throw new DshSessionStorageError(
      row.session_id,
      'ownership-lost',
      'the session has been attached to another machine',
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
    const claim = DSH_WRITER_CLAIM.parse({
      session_id: row.session_id,
      target: request.target,
      runtime_instance: request.runtime_instance,
      connection_generation: request.connection_generation,
      epoch: row.epoch + 1,
    });
    this.context.sql.run(
      'attach native session to its executing machine',
      'update dsh_sessions set claim=$claim,epoch=$epoch where session_id=$id',
      { claim: jsonText(claim), epoch: claim.epoch, id: row.session_id },
    );
    return claim;
  }

  detach(row: DshStoredSession): void {
    this.context.sql.run(
      'detach native session from its machine',
      'update dsh_sessions set claim=null,epoch=$epoch where session_id=$id',
      { epoch: row.epoch + 1, id: row.session_id },
    );
  }
}
