import type { z } from 'zod';
import type { API_ENDPOINTS, ClientRow, HubIdentity } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { clearNativeServerCredential } from '../../../modules/health-connect/src/hub-network';
import type { EnrollmentDestination } from './pairing-destination';
import { PairingIdentityError } from './pairing-errors';
import type { PairingTransport } from './pairing-transport';
import type { PairingRun } from './pairing-session';
import { failureFacts } from './request-log';
import { forgetStoredEnrollment, type ServerConnection } from './storage';

const log = new Logger('app.pairing');

export type Claim = z.infer<typeof API_ENDPOINTS.claimPairing.response>;

export interface PairedResult {
  readonly connection: ServerConnection;
  readonly client: ClientRow;
}

export class Attempt {
  identity: HubIdentity | null = null;
  claimed: { readonly claim: Claim; readonly identity: HubIdentity } | null = null;
  stored = false;
  private paired: PairedResult | null = null;
  constructor(
    readonly destination: EnrollmentDestination,
    readonly transport: PairingTransport,
    readonly run: PairingRun,
  ) {}
  get result(): PairedResult | null {
    return this.paired;
  }
  keep(result: PairedResult): PairedResult {
    this.paired = result;
    return result;
  }
  markStored(): void {
    this.stored = true;
  }
}

export function requireIdentity(expected: HubIdentity, actual: HubIdentity): void {
  if (
    expected.id !== actual.id ||
    expected.tls.serverName !== actual.tls.serverName ||
    expected.tls.publicKeySha256 !== actual.tls.publicKeySha256 ||
    expected.tls.certificateSha256 !== actual.tls.certificateSha256
  )
    throw new PairingIdentityError();
}

export async function forgetSaved(attempt: Attempt): Promise<void> {
  if (!attempt.stored || attempt.result === null) return;
  log.info('pairing.forgetting_saved', { kind: attempt.run.kind });
  try {
    await clearNativeServerCredential(attempt.result.connection.token);
  } catch (error) {
    log.warn('pairing.credential_clear_failed', failureFacts(error));
    throw error;
  } finally {
    await forgetStoredEnrollment(attempt.run.kind, attempt.result.connection);
  }
}
