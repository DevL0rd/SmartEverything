import { createHash, X509Certificate } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import { connect, type TLSSocket } from 'node:tls';
import {
  HUB_PAIRING_INSPECTION,
  HUB_PAIRING_INSPECTION_DEADLINE_MS,
  HUB_PAIRING_INSPECTION_ID,
  HUB_PAIRING_OBSERVATION,
  type HubPairingInspection,
  type HubPairingObservation,
} from '@smarteverything/domain';
import { HubTransportError } from '@smarteverything/hub/client-network/policy';

const log = new Logger('desktop.hub-pairing');

interface PendingInspection<Owner> {
  readonly owner: Owner;
  readonly requestId: string;
  readonly controller: AbortController;
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
  if (certificate === undefined) throw new HubTransportError('Pairing hub sent no certificate');
  const decoded = new X509Certificate(certificate.raw);
  const serverName = canonicalName(decoded, input.serverName);
  const validFrom = new Date(decoded.validFrom);
  const validTo = new Date(decoded.validTo);
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
  signal: AbortSignal,
): Promise<HubPairingObservation> {
  return new Promise((resolve, reject) => {
    const url = new URL(input.url);
    const socket = connect({
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port === '' ? '443' : url.port),
      rejectUnauthorized: false,
      ...(input.serverName === undefined ? {} : { servername: input.serverName }),
    });
    const release = (): void => {
      signal.removeEventListener('abort', cancel);
      socket.destroy();
    };
    const fail = (failure: unknown): void => {
      release();
      reject(
        failure instanceof Error ? failure : new HubTransportError('Pairing inspection failed'),
      );
    };
    const cancel = (): void => {
      fail(signal.reason);
    };
    signal.addEventListener('abort', cancel, { once: true });
    socket.once('error', fail);
    socket.once('secureConnect', () => {
      try {
        const observation = observe(input, socket);
        release();
        resolve(observation);
      } catch (failure) {
        fail(failure);
      }
    });
  });
}

export class HubPairingInspections<Owner> {
  #pending: PendingInspection<Owner> | undefined;
  async inspect(owner: Owner, value: unknown): Promise<HubPairingObservation> {
    const input = HUB_PAIRING_INSPECTION.parse(value);
    const operation = log.operation('pairing.inspect', {
      requestId: input.requestId,
      generation: input.generation,
      replacing: this.#pending !== undefined,
    });
    this.#abort(this.#pending);
    const pending = { owner, requestId: input.requestId, controller: new AbortController() };
    this.#pending = pending;
    try {
      const observation = await inspectSocket(
        input,
        AbortSignal.any([
          pending.controller.signal,
          AbortSignal.timeout(HUB_PAIRING_INSPECTION_DEADLINE_MS),
        ]),
      );
      operation.succeeded();
      return observation;
    } catch (cause) {
      operation.failed(cause);
      throw cause;
    } finally {
      if (this.#pending === pending) this.#pending = undefined;
    }
  }
  cancel(owner: Owner, requestId: string): void {
    const id = HUB_PAIRING_INSPECTION_ID.parse(requestId);
    if (this.#pending?.owner === owner && this.#pending.requestId === id)
      this.#abort(this.#pending);
  }
  clearOwner(owner: Owner): void {
    if (this.#pending?.owner === owner) this.#abort(this.#pending);
  }
  close(): void {
    this.#abort(this.#pending);
  }
  #abort(pending: PendingInspection<Owner> | undefined): void {
    if (pending !== undefined) log.debug('pairing.aborted', { requestId: pending.requestId });
    pending?.controller.abort(new HubTransportError('Pairing inspection was cancelled'));
  }
}
