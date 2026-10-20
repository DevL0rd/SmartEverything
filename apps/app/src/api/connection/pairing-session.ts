import { randomUUID } from 'expo-crypto';
import {
  API_ENDPOINTS,
  HUB_CONNECTION_METADATA,
  hashPairingCode,
  pairingProof,
  type ClientRow,
  type HubDiscoveryCandidate,
  type HubIdentity,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { ValueStore } from '../../design/external-store';
import { handheldKind } from '../../design/platform';
import { activateNativeServerEnrollment } from '../../../modules/health-connect/src/hub-network';
import type { PairingTarget } from '../pairing-input';
import {
  destinationsFromQr,
  httpsDestination,
  inspectedDestination,
  trustedInventory,
  type EnrollmentDestination,
} from './pairing-destination';
import { PairingDiscovery } from './pairing-discovery';
import {
  PairingBusyError,
  PairingCancelledError,
  PairingIdentityError,
  PairingProofError,
  PairingResponseError,
  PairingUnavailableError,
  PairingUnknownOutcomeError,
  PairingUnreachableError,
  pairingMessage,
  releasePairingResources,
} from './pairing-errors';
import { PairingInspection } from './pairing-inspection';
import {
  Attempt,
  forgetSaved,
  requireIdentity,
  type Claim,
  type PairedResult,
} from './pairing-attempt';
import { PairingTransport } from './pairing-transport';
import { nowMs } from './request-log';
import {
  noteClaimed,
  noteClaimFailed,
  noteClaiming,
  noteDestinationFailed,
  noteFinishFailed,
  noteResetting,
  noteRunFailed,
  noteSaveStep,
  noteVerified,
} from './pairing-log';
import { StaleHubRouteError } from './route-policy';
import { storeConnection, type ServerConnection, type StoredKind } from './storage';

const log = new Logger('app.pairing');
const CLAIM = API_ENDPOINTS.claimPairing;
const PROOF = API_ENDPOINTS.proveHub;
const SAVE_AGAIN = 'Pairing finished. Try saving this connection again.';

export type PairingState =
  | { readonly status: 'choosing'; readonly problem: string | null }
  | { readonly status: 'inspecting'; readonly candidate: HubDiscoveryCandidate }
  | { readonly status: 'verifying' }
  | { readonly status: 'ready'; readonly home: string; readonly problem: string | null }
  | { readonly status: 'claiming' }
  | {
      readonly status: 'failed' | 'unknown' | 'recoverable';
      readonly home: string;
      readonly problem: string;
    }
  | { readonly status: 'complete'; readonly client: ClientRow };

export interface PairingRun {
  readonly kind: StoredKind;
  readonly generation: number;
  readonly isCurrent: () => boolean;
  readonly publish: (connection: ServerConnection) => void;
}

export interface PairingHost {
  readonly begin: () => PairingRun;
  readonly release: (run: PairingRun) => void;
}

export function cancelPairingSession(): Promise<void> {
  return PairingSession.current?.chooseAgain() ?? Promise.resolve();
}

export class PairingSession {
  static current: PairingSession | null = null;
  readonly state = new ValueStore<PairingState>({ status: 'choosing', problem: null });
  readonly discovery = new PairingDiscovery();
  private readonly inspection = new PairingInspection();
  private attempt: Attempt | null = null;
  private version = 0;
  constructor(private readonly host: PairingHost) {}
  start(): void {
    PairingSession.current = this;
    this.discovery.start();
  }
  select(url: string): Promise<void> {
    return this.run(async (version) => {
      const candidate = this.discovery.candidate(url);
      if (candidate === null) throw new PairingUnavailableError();
      this.state.set({ status: 'inspecting', candidate });
      const observed = await this.inspection.inspect(
        candidate,
        this.discovery.state.get().generation,
      );
      this.live(version);
      await this.verify(inspectedDestination(candidate, observed), version);
    });
  }
  useQr(target: PairingTarget): Promise<void> {
    return this.run((version) => this.verifyFirst(destinationsFromQr(target), version));
  }
  useAddress(url: string): Promise<void> {
    return this.run((version) => this.verify(httpsDestination(url), version));
  }
  private async run(work: (version: number) => Promise<void>): Promise<void> {
    const version = await this.reset(null);
    const startedAt = nowMs();
    try {
      await work(version);
    } catch (error) {
      if (version !== this.version) return;
      noteRunFailed(error, version, nowMs() - startedAt);
      await this.reset(error instanceof StaleHubRouteError ? null : pairingMessage(error));
    }
  }
  private live(version: number): void {
    if (version !== this.version) throw new PairingCancelledError();
    if (this.attempt?.run.isCurrent() === false) throw new StaleHubRouteError('POST');
  }
  private async verifyFirst(
    destinations: readonly EnrollmentDestination[],
    version: number,
  ): Promise<void> {
    let failure: unknown = new PairingUnreachableError();
    for (const destination of destinations) {
      this.live(version);
      try {
        await this.verify(destination, version);
        return;
      } catch (error) {
        if (version !== this.version || error instanceof StaleHubRouteError) throw error;
        noteDestinationFailed(
          destination.kind,
          destinations.length - destinations.indexOf(destination) - 1,
          error,
        );
        failure = error;
        await this.discardAttempt();
      }
    }
    throw failure;
  }
  private async verify(destination: EnrollmentDestination, version: number): Promise<void> {
    const startedAt = nowMs();
    this.state.set({ status: 'verifying' });
    const transport = new PairingTransport(
      destination.endpoint,
      destination.kind === 'https' ? null : destination.identity,
    );
    const attempt = new Attempt(destination, transport, this.host.begin());
    this.attempt = attempt;
    await transport.open();
    this.live(version);
    const identity = await transport.identityOf();
    this.live(version);
    if (destination.kind !== 'https') requireIdentity(destination.identity, identity);
    attempt.identity = identity;
    noteVerified(destination, nowMs() - startedAt);
    this.state.set({ status: 'ready', home: identity.name, problem: null });
  }
  async submit(code: string, name: string): Promise<void> {
    const attempt = this.attempt;
    const state = this.state.get();
    const identity = attempt?.identity ?? null;
    if (attempt === null || identity === null || state.status !== 'ready')
      throw new PairingBusyError();
    const version = this.version;
    const startedAt = nowMs();
    noteClaiming(attempt.destination.kind, code.length, name.length);
    this.state.set({ status: 'claiming' });
    try {
      if (attempt.destination.kind === 'inspected') await this.prove(attempt, identity, code);
      attempt.claimed = { claim: await this.claim(attempt, code, name), identity };
      noteClaimed(nowMs() - startedAt, attempt.claimed.claim.client.role);
    } catch (error) {
      noteClaimFailed(error, nowMs() - startedAt);
      await this.claimFailed(attempt, state.home, error, version);
      return;
    }
    await this.finish(attempt, version);
  }
  private async prove(attempt: Attempt, identity: HubIdentity, code: string): Promise<void> {
    const nonce = randomUUID().replace(/-/g, '');
    const hash = hashPairingCode(code);
    const certificate = identity.tls.certificateSha256;
    try {
      const answer = await attempt.transport.post(
        PROOF.path,
        { nonce, proof: pairingProof(hash, 'client', certificate, nonce) },
        PROOF.response,
      );
      if (answer.proof !== pairingProof(hash, 'hub', certificate, nonce))
        throw new PairingIdentityError();
    } catch (error) {
      if (error instanceof PairingResponseError && error.status === 422)
        throw new PairingProofError();
      throw error;
    }
  }
  private async claim(attempt: Attempt, code: string, name: string): Promise<Claim> {
    const body = CLAIM.body.parse(
      attempt.run.kind === 'phone'
        ? { code, name, platform: 'android', kind: handheldKind() }
        : { code, name, platform: 'web' },
    );
    try {
      return await attempt.transport.post(CLAIM.path, body, CLAIM.response);
    } catch (error) {
      if (error instanceof PairingResponseError && error.status < 500) throw error;
      throw new PairingUnknownOutcomeError();
    }
  }
  private async claimFailed(
    attempt: Attempt,
    home: string,
    error: unknown,
    version: number,
  ): Promise<void> {
    if (version !== this.version) return;
    if (error instanceof PairingProofError) {
      this.state.set({ status: 'ready', home, problem: error.message });
    } else if (
      error instanceof PairingResponseError ||
      error instanceof PairingUnknownOutcomeError
    ) {
      const status = error instanceof PairingResponseError ? 'failed' : 'unknown';
      this.state.set({ status, home, problem: error.message });
      await attempt.transport.close();
    } else await this.reset(pairingMessage(error));
  }
  recover(): Promise<void> {
    const attempt = this.attempt;
    const claimed = attempt?.claimed ?? null;
    if (attempt === null || claimed === null || this.state.get().status !== 'recoverable')
      throw new PairingBusyError();
    this.state.set({ status: 'claiming' });
    return this.finish(attempt, this.version);
  }
  private async finish(attempt: Attempt, version: number): Promise<void> {
    const home = attempt.claimed?.identity.name ?? '';
    const startedAt = nowMs();
    try {
      const result = attempt.result ?? attempt.keep(await this.metadata(attempt));
      this.live(version);
      await this.save(attempt, result, version);
    } catch (error) {
      if (version !== this.version) return;
      noteFinishFailed(error, nowMs() - startedAt);
      if (error instanceof PairingIdentityError) await this.reset(error.message);
      else if (error instanceof StaleHubRouteError) await this.reset(null);
      else {
        this.state.set({ status: 'recoverable', home, problem: SAVE_AGAIN });
      }
    }
  }
  private async metadata(attempt: Attempt): Promise<PairedResult> {
    if (attempt.claimed === null) throw new PairingBusyError();
    const { claim, identity } = attempt.claimed;
    const metadata = await attempt.transport.get(
      '/api/connection',
      HUB_CONNECTION_METADATA,
      claim.token,
    );
    requireIdentity(identity, metadata.identity);
    const inventory = trustedInventory(metadata, attempt.transport.endpoint);
    const canonical =
      inventory.endpoints.find((entry) => entry.kind === 'remote') ?? attempt.transport.endpoint;
    return {
      client: claim.client,
      connection: {
        url: canonical.url,
        canonicalKind: canonical.kind,
        token: claim.token,
        trustedMetadata: inventory,
      },
    };
  }
  private async save(attempt: Attempt, result: PairedResult, version: number): Promise<void> {
    const { run } = attempt;
    const startedAt = nowMs();
    const step = (name: string): void => {
      noteSaveStep(name, startedAt, nowMs());
    };
    attempt.markStored();
    await storeConnection(run.kind, result.connection, run.isCurrent);
    step('stored');
    this.live(version);
    await this.discovery.stop();
    step('discovery_stopped');
    await activateNativeServerEnrollment(result.connection.url, result.connection.token, {
      isCurrent: run.isCurrent,
    });
    step('enrollment_activated');
    this.live(version);
    await attempt.transport.close();
    step('transport_closed');
    this.live(version);
    this.attempt = null;
    this.state.set({ status: 'complete', client: result.client });
    run.publish(result.connection);
    log.info('connection.paired', {
      kind: run.kind,
      role: result.client.role,
      elapsedMs: nowMs() - startedAt,
    });
  }
  async chooseAgain(): Promise<void> {
    const unknown = this.state.get().status === 'claiming';
    await this.reset(unknown ? new PairingUnknownOutcomeError().message : null);
  }
  private async reset(problem: string | null): Promise<number> {
    const version = ++this.version;
    const attempt = this.attempt;
    noteResetting({
      version,
      hadAttempt: attempt !== null,
      hasProblem: problem !== null,
      previous: this.state.get().status,
    });
    this.attempt = null;
    this.state.set({ status: 'choosing', problem });
    await releasePairingResources([
      { operation: 'inspection', release: (): Promise<void> => this.inspection.cancel() },
      {
        operation: 'enrollment',
        release: (): Promise<void> =>
          attempt === null ? Promise.resolve() : this.discard(attempt),
      },
    ]);
    return version;
  }
  private async discardAttempt(): Promise<void> {
    const attempt = this.attempt;
    this.attempt = null;
    if (attempt !== null) await this.discard(attempt);
  }
  private async discard(attempt: Attempt): Promise<void> {
    try {
      await attempt.transport.close();
    } finally {
      this.host.release(attempt.run);
      await forgetSaved(attempt);
    }
  }
  async stop(): Promise<void> {
    if (PairingSession.current === this) PairingSession.current = null;
    await releasePairingResources([
      { operation: 'retirement', release: (): Promise<void> => this.chooseAgain() },
      { operation: 'discovery', release: (): Promise<void> => this.discovery.stop() },
    ]);
  }
}
