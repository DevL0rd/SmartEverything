import { randomUUID } from 'node:crypto';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessControlPersistence } from './contracts';
import type {
  HarnessRuntimeRequest,
  DshWriterClaim,
  HarnessRuntimeReceipt,
} from '@smarteverything/domain';
import type { HarnessRuntime, HarnessRuntimeOptions } from '../host/runtime';
export async function cleanupUnopened(
  input: Extract<HarnessRuntimeRequest, { kind: 'close' }>,
  persistence: HarnessControlPersistence,
  host: HarnessRuntimeOptions['host'],
): Promise<DshWriterClaim> {
  const claim = input.claim;
  if (
    claim?.session_id !== input.session_id ||
    claim.epoch !== input.expected_epoch ||
    JSON.stringify(claim.target) !== JSON.stringify(host.target)
  )
    throw new HarnessRuntimeError(
      'ownership_lost',
      'Cleanup must name the authenticated execution host, session and exact writer epoch.',
    );
  await persistence.verify(claim);
  persistence.bind(claim);
  const metadata = await persistence.metadata(input.session_id);
  await persistence.flush(claim, metadata.next_seq);
  await persistence.release(claim, randomUUID(), metadata.next_seq);
  persistence.lose(input.session_id);
  return claim;
}
export function requireCleanupIdentity(
  expected: DshWriterClaim,
  received: DshWriterClaim | undefined,
): void {
  if (received === undefined) return;
  if (identity(expected) !== identity(received))
    throw new HarnessRuntimeError(
      'ownership_lost',
      'Cleanup retry changed its authenticated writer identity.',
    );
}
function identity(claim: DshWriterClaim): string {
  const { expires_at: _expiresAt, ...identity } = claim;
  return JSON.stringify(identity);
}

export function nativeSessionPresent(runtime: HarnessRuntime, id: string): boolean {
  try {
    runtime.get(id);
    return true;
  } catch (cause) {
    if (cause instanceof HarnessRuntimeError && cause.code === 'operation_failed') return false;
    throw cause;
  }
}

export function lifecycleReceipt(
  kind: Exclude<HarnessRuntimeRequest['kind'], 'open' | 'prompt' | 'auxiliary' | 'preflight'>,
): HarnessRuntimeReceipt['state'] {
  if (kind === 'close') return 'closed';
  return kind === 'drain' ? 'drained' : 'completed';
}

export async function cleanupFailedOpen(
  claim: DshWriterClaim,
  runtime: HarnessRuntime,
  persistence: HarnessControlPersistence,
): Promise<void> {
  if (nativeSessionPresent(runtime, claim.session_id)) await runtime.close(claim.session_id);
  if (persistence.boundClaim(claim.session_id) !== undefined) {
    const current = await persistence.metadata(claim.session_id);
    await persistence.flush(claim, current.next_seq);
    await persistence.release(claim, randomUUID(), current.next_seq);
  }
  persistence.lose(claim.session_id);
}
