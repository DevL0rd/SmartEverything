import {
  MACHINE_UPDATE_FOLDER,
  MACHINE_UPDATE_MANIFEST,
  MACHINE_UPDATE_MANIFEST_FILE,
  type MachineUpdateArtifact,
  type MachineUpdateManifest,
} from '@smarteverything/domain';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isMissing } from '../fs-util';

export class ReleaseFolderInvalidError extends Error {
  override readonly name = 'ReleaseFolderInvalidError';

  constructor(
    readonly file: string,
    expected: string,
    received: string,
  ) {
    super(`${file} must hold ${expected}; received ${received}`);
  }
}

export class ReleaseFolder {
  private readonly directory: string;

  constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, MACHINE_UPDATE_FOLDER);
  }

  pathOf(file: string): string {
    return join(this.directory, file);
  }

  async manifest(): Promise<MachineUpdateManifest | null> {
    const file = join(this.directory, MACHINE_UPDATE_MANIFEST_FILE);
    const text = await readFile(file, 'utf8').catch((cause: unknown) => {
      if (isMissing(cause)) return null;
      throw cause;
    });
    if (text === null) return null;
    const manifest = MACHINE_UPDATE_MANIFEST.safeParse(parsed(file, text));
    if (!manifest.success) {
      throw new ReleaseFolderInvalidError(
        file,
        'a release manifest naming every file of each platform',
        manifest.error.message,
      );
    }
    await Promise.all(manifest.data.artifacts.map((artifact) => this.checked(artifact)));
    return manifest.data;
  }

  private async checked(artifact: MachineUpdateArtifact): Promise<void> {
    const file = this.pathOf(artifact.file);
    const found = await stat(file).catch((cause: unknown) => {
      if (isMissing(cause)) {
        throw new ReleaseFolderInvalidError(
          file,
          `the ${artifact.kind} file the manifest names`,
          'no file',
        );
      }
      throw cause;
    });
    if (found.size !== artifact.size) {
      throw new ReleaseFolderInvalidError(
        file,
        `${String(artifact.size)} bytes as the manifest says`,
        `${String(found.size)} bytes`,
      );
    }
  }
}

function parsed(file: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new ReleaseFolderInvalidError(file, 'JSON', String(cause));
  }
}
