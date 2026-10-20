import { createHash } from 'node:crypto';
import { PrinterError } from '@smarteverything/domain';
import { IppStatusError } from '@smarteverything/ipp';
import { candidatePaths, parseAddress, portOf, type PrinterAddress } from './address';
import type { PrinterClient } from './client';
import type { Credentials } from './http-auth';
import type { ClientSetup, Described } from './session-host';
import { probeCertificate, type PeerSummary } from './transport';

export interface PairInput {
  readonly uri: string;
  readonly credentials: Credentials | null;
  readonly fingerprint: string | null;
}

export type PairResult =
  | { readonly kind: 'trust'; readonly certificate: PeerSummary; readonly address: PrinterAddress }
  | {
      readonly kind: 'paired';
      readonly address: PrinterAddress;
      readonly described: Described;
      readonly uuid: string;
      readonly pin: string | null;
    };

export interface PairingPorts {
  readonly openClient: (setup: ClientSetup) => Pick<PrinterClient, 'describe'>;
  readonly probe?: (host: string, port: number) => Promise<PeerSummary>;
}

export function uuidOf(described: Described, address: PrinterAddress): string {
  const reported = described.description.identity.uuid;
  if (reported !== null) return reported;
  const digest = createHash('sha1').update(address.uri).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

function describeError(cause: unknown): PrinterError {
  if (cause instanceof PrinterError) return cause;
  if (cause instanceof IppStatusError) {
    const reason = cause.status === 0x0501 ? 'not_a_printer' : 'not_ipp';
    return new PrinterError(reason, cause.message, { status: cause.status });
  }
  return new PrinterError(
    'not_ipp',
    cause instanceof Error ? cause.message : 'The address did not answer like a printer.',
  );
}

async function firstWorking(
  addresses: readonly PrinterAddress[],
  ports: PairingPorts,
  pin: string | null,
  credentials: Credentials | null,
): Promise<{ address: PrinterAddress; described: Described }> {
  let first: PrinterError | null = null;
  for (const address of addresses) {
    try {
      const client = ports.openClient({ address, pin, credentials });
      return { address, described: await client.describe() };
    } catch (cause) {
      const error = describeError(cause);
      first ??= error;
      if (error.reason !== 'wrong_path') throw error;
    }
  }
  throw first ?? new PrinterError('unreachable', 'No printer answered.');
}

export async function pair(input: PairInput, ports: PairingPorts): Promise<PairResult> {
  const address = parseAddress(input.uri);
  const probe = ports.probe ?? probeCertificate;
  let pin: string | null = null;
  if (address.secure) {
    const certificate = await probe(address.url.hostname, portOf(address.url));
    if (input.fingerprint?.toUpperCase() !== certificate.fingerprint.toUpperCase()) {
      return { kind: 'trust', certificate, address };
    }
    pin = certificate.fingerprint;
  }
  const found = await firstWorking(candidatePaths(address), ports, pin, input.credentials);
  return {
    kind: 'paired',
    address: found.address,
    described: found.described,
    uuid: uuidOf(found.described, found.address),
    pin,
  };
}
