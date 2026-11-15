import { FILE_CHUNK_BYTES, type FileUploadChunk } from '@smarteverything/domain';

const DRIVE_ROOT = /^[A-Za-z]:[\\/]/;

const NETWORK_ROOT = /^\\\\[^\\/]+[\\/][^\\/]+/;

export function rootOf(path: string): string {
  const network = NETWORK_ROOT.exec(path);
  if (network !== null) return network[0];
  const drive = DRIVE_ROOT.exec(path);
  return drive === null ? '/' : drive[0];
}

export function separatorOf(path: string): '/' | '\\' {
  return rootOf(path).includes('\\') ? '\\' : '/';
}

function trimmed(path: string): string {
  const root = rootOf(path);
  let end = path.length;
  while (end > root.length && (path[end - 1] === '/' || path[end - 1] === '\\')) end -= 1;
  return path.slice(0, end);
}

export function normalPath(path: string): string {
  const cleaned = trimmed(path.trim());
  const root = rootOf(cleaned);
  return cleaned.length <= root.length ? root : cleaned;
}

export function segmentsOf(path: string): readonly string[] {
  const clean = normalPath(path);
  return clean
    .slice(rootOf(clean).length)
    .split(/[\\/]/)
    .filter((part) => part !== '');
}

export function joinPath(folder: string, name: string): string {
  const base = normalPath(folder);
  const root = rootOf(base);
  if (base === root) return `${root}${name}`;
  return `${base}${separatorOf(base)}${name}`;
}

export function baseName(path: string): string {
  return segmentsOf(path).at(-1) ?? normalPath(path);
}

export function parentOf(path: string): string | null {
  const clean = normalPath(path);
  const root = rootOf(clean);
  if (clean === root) return null;
  const parts = segmentsOf(clean);
  return parts.length <= 1 ? root : `${root}${parts.slice(0, -1).join(separatorOf(clean))}`;
}

export function isWithin(path: string, folder: string): boolean {
  const inner = normalPath(path);
  const outer = normalPath(folder);
  if (inner === outer) return true;
  if (rootOf(inner) !== rootOf(outer)) return false;
  const prefix =
    outer.endsWith('/') || outer.endsWith('\\') ? outer : `${outer}${separatorOf(outer)}`;
  return inner.startsWith(prefix);
}

export interface Piece {
  readonly start: number;
  readonly end: number;
  readonly final: boolean;
}

export function piecesOf(size: number, piece = FILE_CHUNK_BYTES): readonly Piece[] {
  if (size === 0) return [{ start: 0, end: 0, final: true }];
  const pieces: Piece[] = [];
  for (let start = 0; start < size; start += piece) {
    const end = Math.min(size, start + piece);
    pieces.push({ start, end, final: end === size });
  }
  return pieces;
}

export function chunkOf(
  path: string,
  piece: Piece,
  data: string,
  replace: boolean,
): FileUploadChunk {
  return { path, start: piece.start, data, final: piece.final, replace };
}
