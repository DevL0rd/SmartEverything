import { mkdir, readFile, rmdir, symlink, unlink } from 'node:fs/promises';
import type { DrivePlacementBasicLimits } from '@smarteverything/domain';
import { CommandFailedError, type RunCommand } from '../service/system.js';
import type { PlacementFields, RouteKind } from './placement-state.js';
import { upgradeOffer, type TierPorts, type UpgradeOffer } from './placement-tier.js';

export interface BasicFs {
  readonly removeFolder: (folder: string) => Promise<void>;
  readonly makeFolder: (folder: string) => Promise<void>;
  readonly link: (target: string, at: string) => Promise<void>;
  readonly unlink: (at: string) => Promise<void>;
}

export interface BasicPorts extends TierPorts {
  readonly fs: BasicFs;
}

export interface BasicRequest {
  readonly platform: NodeJS.Platform;
  readonly placementId: string;
  readonly davUrl: string;
  readonly localPath: string;
}

export interface BasicMount {
  readonly limits: DrivePlacementBasicLimits;
  readonly offer: UpgradeOffer | null;
  readonly reason: string | null;
  readonly unmount: () => Promise<void>;
}

export const nodeBasicFs: BasicFs = {
  removeFolder: (folder) => rmdir(folder),
  makeFolder: async (folder) => {
    await mkdir(folder, { recursive: true });
  },
  link: (target, at) => symlink(target, at),
  unlink: (at) => unlink(at),
};

export const nodeReadText: TierPorts['readText'] = async (file) => {
  try {
    return await readFile(file, 'utf8');
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null;
    throw cause;
  }
};

const WEBCLIENT_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters';
const WEBCLIENT_DEFAULT_FILE_BYTES = 50_000_000;
const REG_NOT_FOUND = 1;
const VOLUMES = '/Volumes';

export function basicFields(mount: BasicMount, route: RouteKind): PlacementFields {
  return {
    state: 'mounted',
    tier: 'basic',
    basicLimits: mount.limits,
    readOnly: false,
    route,
    reason: mount.reason,
  };
}

export async function webClientFileLimit(run: RunCommand): Promise<number> {
  try {
    const { stdout } = await run('reg', ['query', WEBCLIENT_KEY, '/v', 'FileSizeLimitInBytes']);
    const match = /FileSizeLimitInBytes\s+REG_DWORD\s+0x([0-9a-fA-F]+)/.exec(stdout);
    if (match?.[1] === undefined) {
      throw new Error('FileSizeLimitInBytes was not readable from the registry output');
    }
    return Number.parseInt(match[1], 16);
  } catch (cause) {
    if (cause instanceof CommandFailedError && cause.exitCode === REG_NOT_FOUND) {
      return WEBCLIENT_DEFAULT_FILE_BYTES;
    }
    throw cause;
  }
}

function davScheme(url: string): string {
  if (!url.startsWith('http://')) throw new Error('A Basic mount needs the loopback http address');
  return `dav://${url.slice('http://'.length)}`;
}

async function emptyFolderLink(ports: BasicPorts, target: string, at: string): Promise<void> {
  await ports.fs.removeFolder(at);
  await ports.fs.link(target, at);
}

async function mountLinux(ports: BasicPorts, request: BasicRequest): Promise<BasicMount> {
  const url = davScheme(request.davUrl);
  await ports.run('gio', ['mount', url]);
  const { stdout } = await ports.run('gio', ['info', '-a', 'standard::name', url]);
  const location = /^local path:\s*(.+)$/m.exec(stdout)?.[1];
  if (location === undefined) throw new Error('gio did not report where the folder is mounted');
  await emptyFolderLink(ports, location, request.localPath);
  return {
    limits: { maxFileBytes: null, wholeFileOpen: false, offline: false },
    offer: await upgradeOffer('linux', ports),
    reason: null,
    unmount: async (): Promise<void> => {
      await ports.fs.unlink(request.localPath);
      await ports.run('gio', ['mount', '-u', url]);
    },
  };
}

async function mountMacAt(ports: BasicPorts, request: BasicRequest): Promise<() => Promise<void>> {
  try {
    await ports.run('mount_webdav', ['-S', request.davUrl, request.localPath]);
    return async () => {
      await ports.run('umount', [request.localPath]);
    };
  } catch (cause) {
    if (!(cause instanceof CommandFailedError)) throw cause;
  }
  const volume = `${VOLUMES}/SmartEverything-${request.placementId}`;
  await ports.fs.makeFolder(volume);
  await ports.run('mount_webdav', ['-S', request.davUrl, volume]);
  await emptyFolderLink(ports, volume, request.localPath);
  return async () => {
    await ports.fs.unlink(request.localPath);
    await ports.run('umount', [volume]);
    await ports.fs.removeFolder(volume);
  };
}

async function mountMac(ports: BasicPorts, request: BasicRequest): Promise<BasicMount> {
  return {
    limits: { maxFileBytes: null, wholeFileOpen: true, offline: false },
    offer: null,
    reason: null,
    unmount: await mountMacAt(ports, request),
  };
}

async function mountWindows(ports: BasicPorts, request: BasicRequest): Promise<BasicMount> {
  const maxFileBytes = await webClientFileLimit(ports.run);
  const { stdout } = await ports.run('net', ['use', '*', request.davUrl]);
  const letter = /Drive ([A-Za-z]:)/.exec(stdout)?.[1];
  if (letter === undefined) throw new Error('Windows did not report the drive letter');
  return {
    limits: { maxFileBytes, wholeFileOpen: false, offline: false },
    offer: await upgradeOffer('win32', ports),
    reason: `Available as drive ${letter.toUpperCase()}`,
    unmount: async (): Promise<void> => {
      await ports.run('net', ['use', letter, '/delete']);
    },
  };
}

export async function mountBasic(ports: BasicPorts, request: BasicRequest): Promise<BasicMount> {
  if (request.platform === 'linux') return mountLinux(ports, request);
  if (request.platform === 'win32') return mountWindows(ports, request);
  if (request.platform === 'darwin') return mountMac(ports, request);
  throw new Error(`Mounted only has no Basic tier on ${request.platform}`);
}
