import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { MachineUpdateOfferArtifact } from '@smarteverything/domain';
import { UpdateServerRefusedError, UpdateVerificationError } from './update-errors.js';

function measuring(): { readonly stream: Transform; readonly result: () => Measured } {
  const hash = createHash('sha256');
  let size = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, done): void {
      hash.update(chunk);
      size += chunk.length;
      done(null, chunk);
    },
  });
  return { stream, result: () => ({ size, sha256: hash.digest('hex') }) };
}

interface Measured {
  readonly size: number;
  readonly sha256: string;
}

export async function downloadArtifact(
  artifact: MachineUpdateOfferArtifact,
  serverUrl: string,
  directory: string,
  fetchFrom: typeof fetch,
): Promise<string> {
  const response = await fetchFrom(new URL(artifact.url, serverUrl));
  if (!response.ok || response.body === null) {
    throw new UpdateServerRefusedError(`the download of ${artifact.file}`, response.status);
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const partial = join(directory, `${artifact.file}.part`);
  const final = join(directory, artifact.file);
  const measure = measuring();
  try {
    await pipeline(Readable.fromWeb(response.body), measure.stream, createWriteStream(partial));
    const measured = measure.result();
    if (measured.size !== artifact.size) {
      throw new UpdateVerificationError(
        artifact.file,
        `${String(artifact.size)} bytes`,
        `${String(measured.size)} bytes`,
      );
    }
    if (measured.sha256 !== artifact.sha256) {
      throw new UpdateVerificationError(
        artifact.file,
        `the file with checksum ${artifact.sha256}`,
        `checksum ${measured.sha256}`,
      );
    }
    await rename(partial, final);
    return final;
  } catch (cause) {
    await rm(partial, { force: true });
    throw cause;
  }
}
