import {
  ApiError,
  MACHINE_UPDATE_FILE,
  MACHINE_UPDATE_MANIFEST_FILE,
  MACHINE_UPDATE_NOTICE,
  MACHINE_UPDATE_NOTICE_FILE,
  MACHINE_UPDATE_UPLOAD_PATH,
  type MachineUpdateArtifact,
  type MachineUpdateManifest,
  type MachineUpdatePublication,
  type MachineUpdateStaged,
} from '@smarteverything/domain';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type Stats } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { RawRoute } from '../server/http-server';
import { authenticate } from '../server/auth';
import { sendJson } from '../server/http';
import { assertOwnerRoute } from '../server/owner-route';
import type { Store } from '../store/store';
import type { HubLayout } from '../data-layout';
import { isMissing } from '../fs-util';
import { loadRelease, type ReleaseFolder } from './release-folder';

const RESERVED = new Set([MACHINE_UPDATE_MANIFEST_FILE, MACHINE_UPDATE_NOTICE_FILE]);

async function digestOf(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function statUploaded(path: string, file: string): Promise<Stats> {
  try {
    return await stat(path);
  } catch (cause) {
    if (isMissing(cause)) throw new ApiError('invalid_request', `${file} was not uploaded.`);
    throw cause;
  }
}

async function renameIfPresent(from: string, to: string): Promise<boolean> {
  try {
    await rename(from, to);
    return true;
  } catch (cause) {
    if (isMissing(cause)) return false;
    throw cause;
  }
}

async function receive(
  input: Readable,
  target: string,
): Promise<{ readonly sha256: string; readonly size: number }> {
  const hash = createHash('sha256');
  let size = 0;
  await pipeline(
    input,
    async function* counted(source: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
      for await (const chunk of source) {
        hash.update(chunk);
        size += chunk.length;
        yield chunk;
      }
    },
    createWriteStream(target, { flags: 'wx', mode: 0o600 }),
  );
  return { sha256: hash.digest('hex'), size };
}

export class MachineUpdatePublisher {
  private readonly folder: string;
  private readonly previous: string;
  private readonly staging: string;
  private tail: Promise<undefined> = Promise.resolve(undefined);

  constructor(
    layout: HubLayout,
    private readonly releases: ReleaseFolder,
  ) {
    this.folder = layout.system.updates.machineUpdates;
    this.previous = layout.system.updates.machineUpdatesPrevious;
    this.staging = `${this.folder}.next`;
  }

  stage(file: string, input: Readable): Promise<MachineUpdateStaged> {
    return this.serial(async () => {
      await mkdir(this.staging, { recursive: true, mode: 0o700 });
      const part = join(this.staging, `${file}.part-${randomUUID()}`);
      try {
        const received = await receive(input, part);
        if (received.size === 0) throw new ApiError('invalid_request', `${file} has no bytes.`);
        await rename(part, join(this.staging, file));
        return { file, ...received };
      } catch (cause) {
        await rm(part, { force: true });
        throw cause;
      }
    });
  }

  publish(publication: MachineUpdatePublication): Promise<MachineUpdateManifest> {
    return this.serial(async () => {
      const { manifest, runtimeVersion } = publication;
      await this.verifyStaged(manifest.artifacts);
      await this.pruneStaged(manifest.artifacts);
      await writeFile(
        join(this.staging, MACHINE_UPDATE_MANIFEST_FILE),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      if (runtimeVersion !== undefined) {
        const notice = MACHINE_UPDATE_NOTICE.parse({
          id: randomUUID(),
          version: manifest.version,
          runtimeVersion,
        });
        await writeFile(
          join(this.staging, MACHINE_UPDATE_NOTICE_FILE),
          `${JSON.stringify(notice, null, 2)}\n`,
        );
      }
      await this.swapIn();
      await this.releases.refresh();
      return manifest;
    });
  }

  rollback(): Promise<MachineUpdateManifest> {
    return this.serial(async () => {
      const restored = await loadRelease(this.previous);
      if (restored === null) throw new ApiError('not_found', 'No previous release is stored.');
      const displaced = `${this.folder}.displaced`;
      await rm(displaced, { recursive: true, force: true });
      const hadActive = await renameIfPresent(this.folder, displaced);
      try {
        await rename(this.previous, this.folder);
      } catch (cause) {
        if (hadActive) await rename(displaced, this.folder);
        throw cause;
      }
      if (hadActive) await rename(displaced, this.previous);
      await this.releases.refresh();
      return restored;
    });
  }

  withdraw(): Promise<void> {
    return this.serial(async () => {
      const displaced = `${this.folder}.displaced`;
      await rm(displaced, { recursive: true, force: true });
      await renameIfPresent(this.folder, displaced);
      await rm(displaced, { recursive: true, force: true });
      await this.releases.refresh();
    });
  }

  private async serial<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<undefined>((resolve) => {
      release = (): void => {
        resolve(undefined);
      };
    });
    await previous;
    try {
      return await run();
    } finally {
      release();
    }
  }

  private async verifyStaged(artifacts: readonly MachineUpdateArtifact[]): Promise<void> {
    for (const artifact of artifacts) {
      const path = join(this.staging, artifact.file);
      const found = await statUploaded(path, artifact.file);
      if (found.size !== artifact.size) {
        throw new ApiError(
          'invalid_request',
          `${artifact.file} has ${String(found.size)} bytes; the manifest says ${String(artifact.size)}.`,
        );
      }
      if ((await digestOf(path)) !== artifact.sha256) {
        throw new ApiError(
          'invalid_request',
          `${artifact.file} does not match the sha256 of the manifest.`,
        );
      }
    }
  }

  private async pruneStaged(artifacts: readonly MachineUpdateArtifact[]): Promise<void> {
    const listed = new Set(artifacts.map((artifact) => artifact.file));
    for (const name of await readdir(this.staging)) {
      if (!listed.has(name)) await rm(join(this.staging, name), { recursive: true, force: true });
    }
  }

  private async swapIn(): Promise<void> {
    await rm(this.previous, { recursive: true, force: true });
    const hadRelease = await renameIfPresent(this.folder, this.previous);
    try {
      await rename(this.staging, this.folder);
    } catch (cause) {
      if (hadRelease) await rename(this.previous, this.folder);
      throw cause;
    }
  }
}

export function machineUpdateUploadRoute(
  store: Store,
  publisher: MachineUpdatePublisher,
): RawRoute {
  return {
    method: 'PUT',
    path: MACHINE_UPDATE_UPLOAD_PATH,
    handle: async (request, response, params): Promise<void> => {
      const caller = authenticate(store, request, 'owner', false);
      assertOwnerRoute(store, caller, {
        access: 'owner',
        method: 'PUT',
        path: MACHINE_UPDATE_UPLOAD_PATH,
      });
      const file = MACHINE_UPDATE_FILE.safeParse(params['file']);
      if (!file.success || RESERVED.has(file.data)) {
        throw new ApiError('invalid_request', 'The update file name is not allowed.');
      }
      sendJson(response, 200, await publisher.stage(file.data, request));
    },
  };
}
