import { access, constants } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { DesktopServer } from '@smarteverything/domain';
import { applyFolderUpdate } from './folder-update.js';
import { installKindOf, type InstallKind, type InstallProbe } from './install-kind.js';
import { applySquirrelUpdate, type SquirrelUpdater } from './squirrel-update.js';
import { UpdateController, type StagedUpdate } from './update-controller.js';
import { UpdateInstallError } from './update-errors.js';
import type { RunCommand } from './update-install.js';

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
  readonly restartServices: () => Promise<void>;
  readonly relaunch: (executable: string) => void;
  readonly squirrel: SquirrelUpdater;
}

const probe: InstallProbe = {
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
};

function zipOf(staged: StagedUpdate): string {
  const zip = staged.files.get('zip');
  if (zip === undefined) throw new UpdateInstallError('reading the download', 'it has no zip file');
  return zip;
}

function applier(
  ports: DesktopUpdatePorts,
  install: InstallKind,
): (staged: StagedUpdate) => Promise<void> {
  const executable = basename(ports.execPath);
  switch (install.kind) {
    case 'folder':
      return (staged) =>
        applyFolderUpdate(
          { ...ports, platform: 'linux', root: install.root, executable },
          zipOf(staged),
        );
    case 'bundle':
      return (staged) =>
        applyFolderUpdate(
          {
            ...ports,
            platform: 'darwin',
            root: install.root,
            executable: join(...MAC_EXECUTABLE_FOLDER, executable),
          },
          zipOf(staged),
        );
    case 'squirrel':
      return (staged) => applySquirrelUpdate(ports.squirrel, staged.directory);
    case 'unmanaged':
      return () => Promise.reject(new UpdateInstallError('starting', install.reason));
  }
}

export async function createUpdates(ports: DesktopUpdatePorts): Promise<UpdateController> {
  const install = await installKindOf(ports, probe);
  return new UpdateController({
    version: ports.version,
    platform: ports.platform,
    arch: ports.arch,
    install,
    server: ports.server,
    fetch: ports.fetch,
    stagingDirectory: join(ports.userDataPath, UPDATES_FOLDER),
    apply: applier(ports, install),
  });
}
