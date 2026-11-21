import mime from 'mime-types';
import type { FileType, ScanEntry } from './scanner-drafts';
import type { WalkEntry } from './scanner-walk';

const OCTET_STREAM = 'application/octet-stream';

const DOCUMENT_MIMES: readonly string[] = [
  'text/',
  'application/pdf',
  'application/msword',
  'application/rtf',
  'application/vnd.ms-',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.oasis.opendocument',
];

export function classify(name: string): FileType {
  const found = mime.lookup(name);
  const type = found === false ? OCTET_STREAM : found;
  if (type.startsWith('image/')) return { mime: type, kind: 'image' };
  if (type.startsWith('video/')) return { mime: type, kind: 'video' };
  if (type.startsWith('audio/')) return { mime: type, kind: 'audio' };
  const document = DOCUMENT_MIMES.some((prefix) => type.startsWith(prefix));
  return { mime: type, kind: document ? 'document' : 'other' };
}

export function scanEntryOf(entry: WalkEntry): ScanEntry {
  return { ...entry, type: classify(entry.name) };
}
