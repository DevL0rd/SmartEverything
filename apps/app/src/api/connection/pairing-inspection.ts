import { randomUUID } from 'expo-crypto';
import {
  HUB_PAIRING_INSPECTION,
  HUB_PAIRING_OBSERVATION,
  type HubDiscoveryCandidate,
  type HubPairingObservation,
} from '@smarteverything/domain';
import { PairingIdentityError, PairingUnreachableError } from './pairing-errors';
import { hubNetwork } from './route-platform';
import { Logger } from '@smarteverything/logging';
import { failureFacts, nowMs } from './request-log';

const log = new Logger('app.pairing');

function checked(
  observed: HubPairingObservation,
  candidate: HubDiscoveryCandidate,
): HubPairingObservation {
  if (candidate.hubId !== undefined && candidate.hubId !== observed.tls.publicKeySha256) {
    log.warn('pairing.inspection_identity_mismatch', { advertisedHub: true });
    throw new PairingIdentityError();
  }
  return observed;
}

export class PairingInspection {
  private requestId: string | null = null;
  async inspect(
    candidate: HubDiscoveryCandidate,
    generation: number,
  ): Promise<HubPairingObservation> {
    const network = hubNetwork();
    if (network.inspectCandidate === undefined) {
      log.warn('pairing.inspection_unsupported', { generation });
      throw new PairingUnreachableError();
    }
    const request = HUB_PAIRING_INSPECTION.parse({
      requestId: randomUUID(),
      generation,
      url: candidate.url,
    });
    this.requestId = request.requestId;
    const startedAt = nowMs();
    log.debug('pairing.inspection_started', () => ({
      requestId: request.requestId.slice(0, 8),
      generation,
    }));
    try {
      const observed = HUB_PAIRING_OBSERVATION.parse(await network.inspectCandidate(request));
      log.debug('pairing.inspection_finished', () => ({
        requestId: request.requestId.slice(0, 8),
        elapsedMs: nowMs() - startedAt,
      }));
      return checked(observed, candidate);
    } catch (error) {
      log.warn('pairing.inspection_failed', {
        requestId: request.requestId.slice(0, 8),
        generation,
        elapsedMs: nowMs() - startedAt,
        ...failureFacts(error),
      });
      throw error;
    } finally {
      if (this.requestId === request.requestId) this.requestId = null;
    }
  }
  async cancel(): Promise<void> {
    const requestId = this.requestId;
    this.requestId = null;
    log.debug('pairing.inspection_cancel', { pending: requestId !== null });
    if (requestId !== null) await hubNetwork().cancelInspection?.(requestId);
  }
}
