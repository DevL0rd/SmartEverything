import { randomUUID } from 'expo-crypto';
import {
  HUB_PAIRING_INSPECTION,
  HUB_PAIRING_OBSERVATION,
  HUB_CONNECTION_PROTOCOL,
  type HubDiscoveryCandidate,
  type HubPairingObservation,
} from '@smarteverything/domain';
import { hubNetwork } from './route-platform';
import { PairingIdentityError } from './pairing-transport';
import type { EnrollmentDestination } from './pairing-enrollment';

export class PairingInspection {
  private requestId: string | null = null;
  private observation: HubPairingObservation | null = null;
  private cleanup: Promise<void> = Promise.resolve();
  async inspect(
    candidate: HubDiscoveryCandidate,
    generation: number,
    isCurrent: () => boolean,
  ): Promise<HubPairingObservation> {
    await this.cancel();
    if (!isCurrent()) throw new PairingIdentityError();
    const network = hubNetwork();
    if (
      network.capabilities.pairingInspection !== true ||
      network.inspectCandidate === undefined ||
      network.cancelInspection === undefined
    )
      throw new PairingIdentityError();
    const request = HUB_PAIRING_INSPECTION.parse({
      requestId: randomUUID(),
      generation,
      url: candidate.url,
    });
    this.requestId = request.requestId;
    const observed = HUB_PAIRING_OBSERVATION.parse(await network.inspectCandidate(request));
    if (this.requestId !== request.requestId || !isCurrent()) throw new PairingIdentityError();
    this.validate(observed, request.requestId, candidate, generation);
    this.observation = Object.freeze({ ...observed, tls: Object.freeze(observed.tls) });
    return this.observation;
  }
  private validate(
    observed: HubPairingObservation,
    requestId: string,
    candidate: HubDiscoveryCandidate,
    generation: number,
  ): void {
    if (
      observed.requestId !== requestId ||
      observed.generation !== generation ||
      observed.url !== candidate.url
    )
      throw new PairingIdentityError();
    if (Date.parse(observed.validFrom) > Date.now() || Date.parse(observed.validTo) <= Date.now())
      throw new PairingIdentityError();
    if (candidate.hubId !== undefined && candidate.hubId !== observed.tls.publicKeySha256)
      throw new PairingIdentityError();
  }
  confirm(
    observed: HubPairingObservation,
    candidate: HubDiscoveryCandidate,
  ): EnrollmentDestination {
    if (
      observed !== this.observation ||
      observed.url !== candidate.url ||
      Date.parse(observed.validTo) <= Date.now()
    )
      throw new PairingIdentityError();
    return {
      kind: 'pinned',
      endpoint: { kind: 'lan', url: observed.url },
      identity: {
        id: observed.tls.publicKeySha256,
        protocolVersion: HUB_CONNECTION_PROTOCOL,
        name: candidate.name,
        tls: observed.tls,
      },
    };
  }
  cancel(): Promise<void> {
    const requestId = this.requestId;
    this.observation = null;
    const release = (): Promise<void> => this.cancelPendingInspection(requestId);
    this.cleanup = this.cleanup.then(release, release);
    return this.cleanup;
  }
  private async cancelPendingInspection(requestId: string | null): Promise<void> {
    if (requestId === null || this.requestId !== requestId) return;
    const network = hubNetwork();
    if (network.cancelInspection !== undefined) await network.cancelInspection(requestId);
    if (this.requestId === requestId) this.requestId = null;
  }
}
