import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { MachineUpdateOfferArtifact } from '@smarteverything/domain';
import { UpdateServerRefusedError, UpdateVerificationError } from './update-errors.js';

interface Measured {
  readonly size: number;
  readonly sha256: string;
}

export interface VerifiedDownload {
  readonly url: string;
  readonly sha256: string;
  readonly size: number;
  readonly path: string;
}

function measuring(onBytes: (bytes: number) => void): {
  readonly stream: Transform;
  readonly result: () => Measured;
} {
  const hash = createHash('sha256');
  let size = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, done): void {
      hash.update(chunk);
      size += chunk.length;
      onBytes(chunk.length);
      done(null, chunk);
    },
  });
  return { stream, result: () => ({ size, sha256: hash.digest('hex') }) };
}

function verify(download: VerifiedDownload, measured: Measured): void {
  if (measured.size !== download.size) {
    throw new UpdateVerificationError(
      download.path,
      `${String(download.size)} bytes`,
      `${String(measured.size)} bytes`,
    );
  }
  if (measured.sha256 !== download.sha256) {
    throw new UpdateVerificationError(
      download.path,
      `the file with checksum ${download.sha256}`,
      `checksum ${measured.sha256}`,
    );
  }
}

export async function downloadVerified(
  download: VerifiedDownload,
  serverUrl: string,
  fetchFrom: typeof fetch,
  onBytes: (bytes: number) => void,
): Promise<string> {
  const response = await fetchFrom(new URL(download.url, serverUrl));
  if (!response.ok || response.body === null) {
    throw new UpdateServerRefusedError(`the download of ${download.path}`, response.status);
  }
  await mkdir(dirname(download.path), { recursive: true, mode: 0o700 });
  const partial = `${download.path}.part`;
  const measure = measuring(onBytes);
  try {
    await pipeline(Readable.fromWeb(response.body), measure.stream, createWriteStream(partial));
    verify(download, measure.result());
    await rename(partial, download.path);
    return download.path;
  } catch (cause) {
    await rm(partial, { force: true });
    throw cause;
  }
}

export function downloadArtifact(
  artifact: MachineUpdateOfferArtifact,
  destination: { readonly serverUrl: string; readonly directory: string },
  fetchFrom: typeof fetch,
  onBytes: (bytes: number) => void,
): Promise<string> {
  return downloadVerified(
    {
      url: artifact.url,
      sha256: artifact.sha256,
      size: artifact.size,
      path: join(destination.directory, artifact.file),
    },
    destination.serverUrl,
    fetchFrom,
    onBytes,
  );
}
