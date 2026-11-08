import { GOOGLE_FOLDER_MIME } from '../../../src/drive/google/scopes';
import { bytesReply, failure, jsonReply, type FakeDriveFile } from './content';

const FOLDERS = `mimeType = '${GOOGLE_FOLDER_MIME}' and trashed = false`;
const FILES = `mimeType != '${GOOGLE_FOLDER_MIME}' and trashed = false`;

export interface DriveState {
  readonly files: Map<string, FakeDriveFile>;
  pageSize: number;
}

function view(file: FakeDriveFile): Record<string, unknown> {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    ...(file.parents === undefined ? {} : { parents: file.parents }),
    ...(file.content === null ? {} : { size: String(file.content.byteLength) }),
  };
}

export function listFiles(state: DriveState, query: URLSearchParams): Response {
  const q = query.get('q');
  if (q !== FOLDERS && q !== FILES) {
    return failure(400);
  }
  const wanted = [...state.files.values()].filter((file) =>
    q === FOLDERS ? file.mimeType === GOOGLE_FOLDER_MIME : file.mimeType !== GOOGLE_FOLDER_MIME,
  );
  const from = Number(query.get('pageToken') ?? '0');
  const page = wanted.slice(from, from + state.pageSize);
  const next = from + state.pageSize;
  return jsonReply(200, {
    files: page.map(view),
    ...(next < wanted.length ? { nextPageToken: String(next) } : {}),
  });
}

export function mediaOf(state: DriveState, id: string, exportAs: string | null): Response {
  const file = state.files.get(id);
  if (file === undefined) {
    return failure(404);
  }
  if (exportAs !== null) {
    const exported = file.exports.get(exportAs);
    return exported === undefined ? failure(403) : bytesReply(exported);
  }
  return file.content === null ? failure(403) : bytesReply(file.content);
}
