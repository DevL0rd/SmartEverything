import type { IconName } from '../../../components/icon';
import type { ColourRole } from '../../../design/tokens';

export type FileKind =
  'pdf' | 'document' | 'sheet' | 'code' | 'archive' | 'audio' | 'video' | 'other';

export interface FileKindLook {
  readonly icon: IconName;
  readonly ink: ColourRole;
  readonly tile: string;
  readonly text: string;
}

export const FILE_KIND_LOOK: Readonly<Record<FileKind, FileKindLook>> = {
  pdf: { icon: 'fileText', ink: 'critical', tile: 'bg-critical/16', text: 'text-critical' },
  document: { icon: 'fileText', ink: 'viz-6', tile: 'bg-viz-6/16', text: 'text-viz-6' },
  sheet: { icon: 'grid', ink: 'viz-5', tile: 'bg-viz-5/16', text: 'text-viz-5' },
  code: { icon: 'terminal', ink: 'viz-3', tile: 'bg-viz-3/16', text: 'text-viz-3' },
  archive: { icon: 'box', ink: 'viz-2', tile: 'bg-viz-2/16', text: 'text-viz-2' },
  audio: { icon: 'audioLines', ink: 'viz-4', tile: 'bg-viz-4/16', text: 'text-viz-4' },
  video: { icon: 'film', ink: 'viz-1', tile: 'bg-viz-1/16', text: 'text-viz-1' },
  other: {
    icon: 'paperclip',
    ink: 'on-surface-variant',
    tile: 'bg-on-surface-variant/16',
    text: 'text-on-surface-variant',
  },
};

const SHEET = /(csv|spreadsheet|excel|opendocument\.spreadsheet|numbers)/;

const ARCHIVE = /(zip|gzip|x-tar|x-7z|x-rar|vnd\.rar|x-bzip|x-xz|compressed)/;

const CODE = /(json|yaml|toml|xml|javascript|typescript|x-sh|x-python|x-shellscript|sql)/;

const DOCUMENT = /(msword|wordprocessing|opendocument\.text|rtf|markdown|epub)/;

const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'sh',
  'py',
  'rs',
  'go',
  'kt',
  'java',
  'swift',
  'c',
  'h',
  'cpp',
  'css',
  'html',
  'sql',
]);

export function typeTagOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  return dot <= 0 || dot === name.length - 1 ? null : name.slice(dot + 1).toUpperCase();
}

function mediaKindOf(mime: string): FileKind | null {
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  return null;
}

function familyOf(mime: string, tag: string): FileKind {
  if (SHEET.test(mime)) return 'sheet';
  if (ARCHIVE.test(mime)) return 'archive';
  if (CODE.test(mime) || CODE_EXTENSIONS.has(tag)) return 'code';
  if (DOCUMENT.test(mime) || mime.startsWith('text/')) return 'document';
  return 'other';
}

export function fileKindOf(file: { readonly name: string; readonly mime: string }): FileKind {
  const mime = file.mime.toLowerCase();
  return mediaKindOf(mime) ?? familyOf(mime, (typeTagOf(file.name) ?? '').toLowerCase());
}
