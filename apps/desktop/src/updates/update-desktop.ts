import { access, constants } from 'node:fs/promises';
import { basename, delimiter, join } from 'node:path';
import type { DesktopServer } from '@smarteverything/domain';
import { readSearchPath } from '../environment.js';
import { applyFolderUpdate } from './folder-update.js';
import { installKindOf, type InstallKind, type InstallProbe } from './install-kind.js';
import { applySquirrelUpdate, type SquirrelUpdater } from './squirrel-update.js';
import { UpdateController, type StagedUpdate } from './update-controller.js';
import { UpdateInstallError } from './update-errors.js';
import {
  removeBootLeftovers,
  removeStaged,
  removeStagedUpTo,
  type RunCommand,
} from './update-install.js';

const UPDATES_FOLDER = 'updates';
const MAC_EXECUTABLE_FOLDER = ['Contents', 'MacOS'] as const;

export interface DesktopUpdatePorts {
  readonly version: string;
  readonly packaged: boolean;
  readonly execPath: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly userDataPath: string;
  readonly server: () => Promise<DesktopServer | null>;
  readonly fetch: typeof fetch;
  readonly run: RunCommand;
  readonly prepareComputerRestart: () => Promise<() => Promise<void>>;
  readonly verifyCandidate: (executable: string, profile: string, version: string) => Promise<void>;
  readonly relaunch: (executable: string) => Promise<void>;
  readonly squirrel: SquirrelUpdater;
}

const defaultProbe: InstallProbe = {
  writable: (path) =>
    access(path, constants.W_OK).then(
      () => true,
      () => false,
    ),
  exists: (path) =>
    access(path, constants.F_OK).then(
      () => true,
      () => false,
    ),
  hasCommand: async (name) => {
    const folders = readSearchPath()
      .split(delimiter)
      .filter((folder) => folder !== '');
    for (const folder of folders) {
      const found = await access(join(folder, name), constants.X_OK).then(
        () => true,
        () => false,
      );
      if (found) return true;
    }
    return false;
  },
};

function zipOf(staged: StagedUpdate): string {
  const zip = staged.files.get('zip');
  if (zip === undefined) throw new UpdateInstallError('reading the download', 'it has no zip file');
  return zip;
}

function handedOver(
  apply: (staged: StagedUpdate) => Promise<void>,
): (staged: StagedUpdate) => Promise<void> {
  return async (staged) => {
    await apply(staged);
    await removeStaged(staged.directory);
  };
}

async function cleanAfterBoot(
  ports: DesktopUpdatePorts,
  install: InstallKind,
  stagingDirectory: string,
): Promise<void> {
  if (install.kind === 'folder' || install.kind === 'bundle') {
    await removeBootLeftovers(install.root, stagingDirectory, ports.version);
    return;
  }
  await removeStagedUpTo(stagingDirectory, ports.version);
}

function applier(
  ports: DesktopUpdatePorts,
  install: InstallKind,
): (staged: StagedUpdate) => Promise<void> {
  const executable = basename(ports.execPath);
  switch (install.kind) {
    case 'folder':
      return handedOver((staged) =>
        applyFolderUpdate(
          { ...ports, platform: 'linux', root: install.root, executable, version: staged.version },
          zipOf(staged),
        ),
      );
    case 'bundle':
      return handedOver((staged) =>
        applyFolderUpdate(
          {
            ...ports,
            platform: 'darwin',
            root: install.root,
            version: staged.version,
            executable: join(...MAC_EXECUTABLE_FOLDER, executable),
          },
          zipOf(staged),
        ),
      );
    case 'squirrel':
      return (staged) => applySquirrelUpdate(ports.squirrel, staged.directory);
    case 'unmanaged':
      return () => Promise.reject(new UpdateInstallError('starting', install.reason));
  }
}

export async function createUpdates(
  ports: DesktopUpdatePorts,
  probe: InstallProbe = defaultProbe,
): Promise<UpdateController> {
  const install = await installKindOf(ports, probe);
  const stagingDirectory = join(ports.userDataPath, UPDATES_FOLDER);
  await cleanAfterBoot(ports, install, stagingDirectory);
  return new UpdateController({
    version: ports.version,
    platform: ports.platform,
    arch: ports.arch,
    install,
    server: ports.server,
    fetch: ports.fetch,
    stagingDirectory,
    apply: applier(ports, install),
  });
}
