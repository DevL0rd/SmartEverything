import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, posix, relative } from 'node:path';
import { fsCode } from '../../../fs-code';
import type { DriveFolderIconSource } from '../../../store/repositories/drive-folder-icons';
import { DrivePathError, openResolved, resolveInRoot } from '../../paths';
import { BinaryContentError, decodeText } from '../extract/plain';
import { desktopIniIcon } from './desktop-ini';
import { directoryFileIcon } from './directory-file';
import { IconImageError, renderFolderIcon, type RenderedIcon } from './render';

const DIRECTORY_FILE = '.directory';

const DESKTOP_INI = 'desktop.ini';

const MAC_ICON_SIDECAR = '._Icon\r';

const NAMED_FILES = [
  'folder.ico',
  'icon.ico',
  'folder.png',
  'icon.png',
  '.folder.png',
  'folder.jpg',
] as const;

const IMAGE_EXTENSIONS = new Set([
  'ico',
  'icns',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'tif',
  'tiff',
  'avif',
]);

const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:|%)/u;

const BROKEN_ESCAPE = /%(?![0-9a-f]{2})/iu;

const ABSENT = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

export interface DetectedIcon extends RenderedIcon {
  readonly source: DriveFolderIconSource;
  readonly relPath: string;
  readonly modifiedMs: number;
}

interface Look {
  readonly rootPath: string;
  readonly folderRel: string;
  readonly names: readonly string[];
  readonly lower: ReadonlyMap<string, string>;
}

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function fileUrlPath(value: string): string | null {
  if (!value.startsWith('file://')) return value;
  if (!URL.canParse(value)) return null;
  const { pathname } = new URL(value);
  return BROKEN_ESCAPE.test(pathname) ? null : decodeURIComponent(pathname);
}

function insideRoot(path: string, folderRel: string, rootPath: string): string | null {
  const inside = isAbsolute(path)
    ? relative(rootPath, path).replaceAll('\\', '/')
    : posix.join(folderRel, path);
  const normal = posix.normalize(inside);
  return normal === '' ||
    normal === '.' ||
    normal.startsWith('../') ||
    normal === '..' ||
    isAbsolute(normal)
    ? null
    : normal;
}

export function iconReference(value: string, folderRel: string, rootPath: string): string | null {
  const unquoted = fileUrlPath(value.trim().replace(/^"|"$/gu, ''));
  const cleaned = unquoted?.replaceAll('\\', '/') ?? '';
  if (cleaned === '' || WINDOWS_ABSOLUTE.test(cleaned)) return null;
  if (!IMAGE_EXTENSIONS.has(extensionOf(cleaned))) return null;
  return insideRoot(cleaned, folderRel, rootPath);
}

function isAbsent(cause: unknown): boolean {
  return cause instanceof DrivePathError || ABSENT.has(fsCode(cause) ?? '');
}

async function namesIn(rootPath: string, relPath: string): Promise<readonly string[]> {
  try {
    return await readdir((await resolveInRoot(rootPath, relPath)).absolute);
  } catch (cause) {
    if (isAbsent(cause)) return [];
    throw cause;
  }
}

async function actualCase(rootPath: string, relPath: string): Promise<string | null> {
  const actual: string[] = [];
  for (const segment of relPath.split('/')) {
    const names = await namesIn(rootPath, actual.join('/'));
    const match =
      names.find((name) => name === segment) ??
      names.find((name) => name.toLowerCase() === segment.toLowerCase());
    if (match === undefined) return null;
    actual.push(match);
  }
  return actual.join('/');
}

interface FileRead {
  readonly bytes: Buffer;
  readonly modifiedMs: number;
}

async function readFileAt(rootPath: string, relPath: string): Promise<FileRead | null> {
  try {
    const handle = await openResolved(await resolveInRoot(rootPath, relPath), 'read');
    try {
      const info = await handle.stat();
      if (!info.isFile()) return null;
      return { bytes: await handle.readFile(), modifiedMs: Math.max(1, Math.trunc(info.mtimeMs)) };
    } finally {
      await handle.close();
    }
  } catch (cause) {
    if (isAbsent(cause)) return null;
    throw cause;
  }
}

async function iconFrom(
  rootPath: string,
  source: DriveFolderIconSource,
  relPath: string,
): Promise<DetectedIcon | null> {
  const file = await readFileAt(rootPath, relPath);
  if (file === null) return null;
  try {
    return {
      ...(await renderFolderIcon(file.bytes)),
      source,
      relPath,
      modifiedMs: file.modifiedMs,
    };
  } catch (cause) {
    if (cause instanceof IconImageError) return null;
    throw cause;
  }
}

async function textAt(rootPath: string, relPath: string): Promise<string | null> {
  const file = await readFileAt(rootPath, relPath);
  if (file === null) return null;
  try {
    return decodeText(file.bytes);
  } catch (cause) {
    if (cause instanceof BinaryContentError) return null;
    throw cause;
  }
}

async function referenced(
  look: Look,
  source: DriveFolderIconSource,
  value: string | null,
): Promise<DetectedIcon | null> {
  if (value === null) return null;
  const reference = iconReference(value, look.folderRel, look.rootPath);
  if (reference === null) return null;
  const real = await actualCase(look.rootPath, reference);
  return real === null ? null : iconFrom(look.rootPath, source, real);
}

async function fromTextFile(
  look: Look,
  name: string | undefined,
  source: DriveFolderIconSource,
  iconOf: (text: string) => string | null,
): Promise<DetectedIcon | null> {
  if (name === undefined) return null;
  const text = await textAt(look.rootPath, posix.join(look.folderRel, name));
  return referenced(look, source, text === null ? null : iconOf(text));
}

async function fromMacSidecar(look: Look): Promise<DetectedIcon | null> {
  return look.names.includes(MAC_ICON_SIDECAR)
    ? iconFrom(look.rootPath, 'mac_icon', posix.join(look.folderRel, MAC_ICON_SIDECAR))
    : null;
}

async function fromNamedFiles(look: Look): Promise<DetectedIcon | null> {
  for (const wanted of NAMED_FILES) {
    const name = look.lower.get(wanted);
    if (name === undefined) continue;
    const found = await iconFrom(look.rootPath, 'named_file', posix.join(look.folderRel, name));
    if (found !== null) return found;
  }
  return null;
}

export async function detectFolderIcon(
  rootPath: string,
  folderRel: string,
): Promise<DetectedIcon | null> {
  const names = await namesIn(rootPath, folderRel);
  const look: Look = {
    rootPath,
    folderRel,
    names,
    lower: new Map(names.map((name) => [name.toLowerCase(), name])),
  };
  const attempts: readonly (() => Promise<DetectedIcon | null>)[] = [
    (): Promise<DetectedIcon | null> =>
      fromTextFile(
        look,
        names.find((name) => name === DIRECTORY_FILE),
        'directory_file',
        directoryFileIcon,
      ),
    (): Promise<DetectedIcon | null> =>
      fromTextFile(look, look.lower.get(DESKTOP_INI), 'desktop_ini', desktopIniIcon),
    (): Promise<DetectedIcon | null> => fromMacSidecar(look),
    (): Promise<DetectedIcon | null> => fromNamedFiles(look),
  ];
  for (const attempt of attempts) {
    const found = await attempt();
    if (found !== null) return found;
  }
  return null;
}

export async function modifiedMsOf(rootPath: string, relPath: string): Promise<number | null> {
  try {
    const info = await stat((await resolveInRoot(rootPath, relPath)).absolute);
    return Math.max(1, Math.trunc(info.mtimeMs));
  } catch (cause) {
    if (isAbsent(cause)) return null;
    throw cause;
  }
}
