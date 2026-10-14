import { createHash, X509Certificate } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { connect, type TLSSocket } from 'node:tls';
import {
  HUB_PAIRING_CERTIFICATE_MAX_BYTES,
  HUB_PAIRING_INSPECTION,
  HUB_PAIRING_INSPECTION_ID,
  HUB_PAIRING_INSPECTION_DEADLINE_MS,
  HUB_PAIRING_OBSERVATION,
  type HubPairingInspection,
  type HubPairingObservation,
} from '../../../../packages/domain/src/hub-pairing';
import type { HubDiscoveryCandidate } from '../../../../packages/domain/src/hub-connections';
import { HubTransportError } from './policy.js';

interface PendingInspection<Owner> {
  readonly owner: Owner;
  readonly requestId: string;
  readonly current: () => boolean;
  readonly cancel: () => void;
}

const MAX_CANCELLED_INSPECTIONS = 64;

function checkDeadline(startedAt: number): void {
  if (performance.now() - startedAt >= HUB_PAIRING_INSPECTION_DEADLINE_MS)
    throw new HubTransportError('Pairing inspection exceeded its deadline');
}

function fingerprint(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalName(certificate: X509Certificate, expected: string | undefined): string {
  const names = [
    ...(certificate.subjectAltName ?? '').matchAll(
      /(?:^|, )DNS:(smarteverything-[0-9a-f]{32}\.local)(?=, |$)/g,
    ),
  ]
    .map((match) => match[1])
    .filter(
      (name) =>
        name !== undefined &&
        certificate.checkHost(name, { subject: 'never', wildcards: false }) === name,
    );
  const serverName = names[0];
  if (
    names.length !== 1 ||
    serverName === undefined ||
    (expected !== undefined && expected !== serverName)
  )
    throw new HubTransportError('Pairing certificate requires one exact canonical DNS SAN');
  return serverName;
}

function observe(input: HubPairingInspection, socket: TLSSocket): HubPairingObservation {
  const certificate = socket.getPeerX509Certificate();
  if (certificate === undefined || certificate.raw.length > HUB_PAIRING_CERTIFICATE_MAX_BYTES)
    throw new HubTransportError('Pairing certificate is missing or exceeds the bound');
  const decoded = new X509Certificate(certificate.raw);
  const serverName = canonicalName(decoded, input.serverName);
  const validFrom = new Date(decoded.validFrom);
  const validTo = new Date(decoded.validTo);
  if (validFrom.getTime() > Date.now() || validTo.getTime() <= Date.now())
    throw new HubTransportError('Pairing certificate is outside its validity period');
  const url = new URL(input.url);
  return HUB_PAIRING_OBSERVATION.parse({
    kind: 'observed',
    requestId: input.requestId,
    generation: input.generation,
    url: input.url,
    address: url.hostname.replace(/^\[|\]$/g, ''),
    port: Number(url.port === '' ? '443' : url.port),
    tls: {
      serverName,
      certificateSha256: fingerprint(decoded.raw),
      publicKeySha256: fingerprint(decoded.publicKey.export({ type: 'spki', format: 'der' })),
    },
    validFrom: validFrom.toISOString(),
    validTo: validTo.toISOString(),
  });
}

function inspectSocket(
  input: HubPairingInspection,
  startedAt: number,
  current: () => boolean,
  register: (cancel: () => void) => void,
): Promise<HubPairingObservation> {
  return new Promise((resolve, reject) => {
    const url = new URL(input.url);
    const socket = connect({
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port === '' ? '443' : url.port),
      rejectUnauthorized: false,
      ...(input.serverName === undefined ? {} : { servername: input.serverName }),
    });
    const finish = (failure?: Error, observation?: HubPairingObservation): void => {
      clearTimeout(timer);
      socket.destroy();
      if (failure !== undefined) reject(failure);
      else if (observation !== undefined) resolve(observation);
      else reject(new HubTransportError('Pairing inspection has no observation'));
    };
    const timer = setTimeout(
      () => {
        finish(new HubTransportError('Pairing inspection exceeded its deadline'));
      },
      Math.max(0, HUB_PAIRING_INSPECTION_DEADLINE_MS - (performance.now() - startedAt)),
    );
    timer.unref();
    register(() => {
      finish(new HubTransportError('Pairing inspection was cancelled'));
    });
    socket.once('error', (failure) => {
      finish(failure);
    });
    socket.once('secureConnect', () => {
      try {
        checkDeadline(startedAt);
        if (!current()) throw new HubTransportError('Pairing candidate was withdrawn');
        const observation = observe(input, socket);
        checkDeadline(startedAt);
        finish(undefined, observation);
      } catch (failure) {
        finish(
          failure instanceof Error ? failure : new HubTransportError('Pairing inspection failed'),
        );
      }
    });
  });
}

export class HubPairingInspections<Owner> {
  #pending: PendingInspection<Owner> | undefined;
  readonly #cancelledRequests = new Map<Owner, Set<string>>();
  async inspect(
    owner: Owner,
    value: unknown,
    select: (input: HubPairingInspection) => HubDiscoveryCandidate,
  ): Promise<HubPairingObservation> {
    const input = HUB_PAIRING_INSPECTION.parse(value);
    if (this.#pending !== undefined)
      throw new HubTransportError('One pairing inspection may run at a time');
    if (this.#takeCancellation(owner, input.requestId))
      throw new HubTransportError('Pairing inspection was cancelled before starting');
    const startedAt = performance.now();
    const candidate = select(input);
    const cancellation = { cancelled: false };
    const current = (): boolean => {
      try {
        return select(input) === candidate;
      } catch (failure) {
        if (failure instanceof HubTransportError) return false;
        throw failure;
      }
    };
    try {
      const observation = await inspectSocket(input, startedAt, current, (cancel) => {
        this.#pending = {
          owner,
          requestId: input.requestId,
          current,
          cancel: (): void => {
            cancellation.cancelled = true;
            cancel();
          },
        };
      });
      if (
        !current() ||
        (candidate.hubId !== undefined && candidate.hubId !== observation.tls.publicKeySha256)
      )
        throw new HubTransportError('Pairing candidate identity changed');
      if (cancellation.cancelled) throw new HubTransportError('Pairing inspection was cancelled');
      checkDeadline(startedAt);
      return observation;
    } finally {
      this.#pending = undefined;
    }
  }
  cancel(owner: Owner, requestId: string): void {
    const id = HUB_PAIRING_INSPECTION_ID.parse(requestId);
    if (this.#pending?.owner === owner && this.#pending.requestId === id) {
      this.#pending.cancel();
      return;
    }
    const requests = this.#cancelledRequests.get(owner) ?? new Set<string>();
    if (requests.has(id)) return;
    const count = [...this.#cancelledRequests.values()].reduce((total, ids) => total + ids.size, 0);
    if (count >= MAX_CANCELLED_INSPECTIONS)
      throw new HubTransportError('Pairing cancellation capacity exceeded');
    requests.add(id);
    this.#cancelledRequests.set(owner, requests);
  }
  #takeCancellation(owner: Owner, requestId: string): boolean {
    const requests = this.#cancelledRequests.get(owner);
    if (requests === undefined) return false;
    const cancelled = requests.delete(requestId);
    if (requests.size === 0) this.#cancelledRequests.delete(owner);
    return cancelled;
  }
  clearOwner(owner: Owner): void {
    if (this.#pending?.owner === owner) this.#pending.cancel();
    this.#cancelledRequests.delete(owner);
  }
  reconcile(): void {
    if (this.#pending !== undefined && !this.#pending.current()) this.#pending.cancel();
  }
  close(): void {
    this.#pending?.cancel();
    this.#cancelledRequests.clear();
  }
}
