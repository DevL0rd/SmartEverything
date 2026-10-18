import { Logger } from '@smarteverything/logging';
import {
  PairingError,
  PairingIdentityError,
  PairingProofError,
  PairingResponseError,
  PairingUnknownOutcomeError,
} from './pairing-errors';
import { failureFacts } from './request-log';
import { StaleHubRouteError } from './route-policy';
import type { EnrollmentDestination } from './pairing-destination';

const log = new Logger('app.pairing');

function claimOutcomeOf(error: unknown): string {
  if (error instanceof PairingProofError) return 'proof_rejected';
  if (error instanceof PairingResponseError) return 'refused';
  if (error instanceof PairingUnknownOutcomeError) return 'unknown_outcome';
  return 'error';
}

export function noteClaimFailed(error: unknown, elapsedMs: number): void {
  log.warn('pairing.claim_failed', {
    elapsedMs,
    outcome: claimOutcomeOf(error),
    ...(error instanceof PairingResponseError ? { status: error.status } : {}),
    ...failureFacts(error),
  });
}

export function noteSaveStep(step: string, startedAt: number, now: number): void {
  log.debug('pairing.save_step', { step, elapsedMs: now - startedAt });
}

export function noteDestinationFailed(kind: string, remaining: number, error: unknown): void {
  log.info('pairing.destination_failed', { kind, remaining, ...failureFacts(error) });
}

export function noteResetting(facts: Readonly<Record<string, unknown>>): void {
  log.debug('pairing.reset', facts);
}

export function noteRunFailed(error: unknown, version: number, elapsedMs: number): void {
  const expected = error instanceof PairingError || error instanceof StaleHubRouteError;
  log[expected ? 'info' : 'warn']('pairing.failed', {
    version,
    elapsedMs,
    ...failureFacts(error),
  });
}

export function noteVerified(destination: EnrollmentDestination, elapsedMs: number): void {
  log.info('pairing.verified', {
    destination: destination.kind,
    endpointKind: destination.endpoint.kind,
    elapsedMs,
  });
}

export function noteClaiming(destination: string, codeLength: number, nameLength: number): void {
  log.info('pairing.claiming', { destination, codeLength, nameLength });
}

export function noteClaimed(elapsedMs: number, role: string): void {
  log.info('pairing.claimed', { elapsedMs, role });
}

export function noteFinishFailed(error: unknown, elapsedMs: number): void {
  if (error instanceof PairingIdentityError) log.warn('pairing.identity_mismatch', { elapsedMs });
  else if (error instanceof StaleHubRouteError) log.info('pairing.finish_stale', { elapsedMs });
  else log.warn('pairing.save_failed', { elapsedMs, ...failureFacts(error) });
}
