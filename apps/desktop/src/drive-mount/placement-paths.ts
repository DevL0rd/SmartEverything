import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { DrivePlacement } from '@smarteverything/domain';

export type FolderState = readonly string[] | 'absent' | 'file';

export interface PathFs {
  readonly inspect: (folder: string) => Promise<FolderState>;
  readonly create: (folder: string) => Promise<void>;
}

export interface PathFacts {
  readonly platform: NodeJS.Platform;
  readonly dataDirectory: string;
  readonly systemDirectories: readonly string[];
}

export interface PathCheck {
  readonly placement: DrivePlacement;
  readonly earlier: readonly DrivePlacement[];
  readonly requireEmpty: boolean;
}

const POSIX_SYSTEM = [
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/lib',
  '/lib32',
  '/lib64',
  '/proc',
  '/root',
  '/run',
  '/sbin',
  '/sys',
  '/usr',
  '/var',
];

const DARWIN_SYSTEM = [
  '/System',
  '/Library',
  '/Applications',
  '/private',
  '/Volumes',
  '/bin',
  '/dev',
  '/etc',
  '/sbin',
  '/usr',
  '/var',
];

function pathApi(platform: NodeJS.Platform): typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix;
}

export function systemDirectories(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  if (platform === 'win32') {
    const drive = env['SystemDrive'] ?? 'C:';
    return [
      env['SystemRoot'] ?? `${drive}\\Windows`,
      env['ProgramFiles'] ?? `${drive}\\Program Files`,
      env['ProgramFiles(x86)'] ?? `${drive}\\Program Files (x86)`,
      env['ProgramData'] ?? `${drive}\\ProgramData`,
    ];
  }
  return platform === 'darwin' ? DARWIN_SYSTEM : POSIX_SYSTEM;
}

function normal(platform: NodeJS.Platform, value: string): string {
  const resolved = pathApi(platform).resolve(value);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function contains(platform: NodeJS.Platform, parent: string, child: string): boolean {
  const api = pathApi(platform);
  const relation = api.relative(normal(platform, parent), normal(platform, child));
  return (
    relation === '' ||
    (relation !== '..' && !relation.startsWith(`..${api.sep}`) && !api.isAbsolute(relation))
  );
}

function overlaps(platform: NodeJS.Platform, first: string, second: string): boolean {
  return contains(platform, first, second) || contains(platform, second, first);
}

function isFilesystemRoot(platform: NodeJS.Platform, value: string): boolean {
  const api = pathApi(platform);
  const resolved = api.resolve(value);
  return resolved === api.parse(resolved).root;
}

function staticRefusal(facts: PathFacts, target: string): string | null {
  const { platform } = facts;
  if (!pathApi(platform).isAbsolute(target)) return 'The path must be absolute';
  if (isFilesystemRoot(platform, target)) return 'The path is the top of a drive';
  if (overlaps(platform, facts.dataDirectory, target)) {
    return 'The path overlaps the Computer service data folder';
  }
  if (facts.systemDirectories.some((system) => contains(platform, system, target))) {
    return 'The path is a system folder or inside one';
  }
  return null;
}

async function folderRefusal(fs: PathFs, target: string): Promise<string | null> {
  const state = await fs.inspect(target);
  if (state === 'file') return 'The mount path is a file, not a folder';
  if (state !== 'absent' && state.length > 0) return 'The mount folder must be empty';
  return null;
}

export async function pathRefusal(
  check: PathCheck,
  facts: PathFacts,
  fs: PathFs,
): Promise<string | null> {
  const target = check.placement.localPath;
  const refused = staticRefusal(facts, target);
  if (refused !== null) return refused;
  if (check.earlier.some((other) => overlaps(facts.platform, other.localPath, target))) {
    return 'The path overlaps another folder placed on this computer';
  }
  if (check.placement.mode !== 'mounted' || !check.requireEmpty) return null;
  return folderRefusal(fs, target);
}

function missing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

function notFolder(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOTDIR';
}

export const nodePathFs: PathFs = {
  inspect: async (folder) => {
    try {
      return await readdir(folder);
    } catch (cause) {
      if (missing(cause)) return 'absent';
      if (notFolder(cause)) return 'file';
      throw cause;
    }
  },
  create: async (folder) => {
    await mkdir(folder, { recursive: true });
  },
};
