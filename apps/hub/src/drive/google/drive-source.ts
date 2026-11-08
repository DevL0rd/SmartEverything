import { DRIVE_FILE_FIELDS, DRIVE_PAGE, type DriveFile } from './schemas';
import type { GoogleHttp } from './http';
import { DRIVE_API, GOOGLE_APPS_PREFIX, GOOGLE_FOLDER_MIME } from './scopes';

const OFFICE = 'application/vnd.openxmlformats-officedocument';

const EXPORTS: ReadonlyMap<string, { readonly mime: string; readonly extension: string }> = new Map(
  [
    [
      `${GOOGLE_APPS_PREFIX}document`,
      { mime: `${OFFICE}.wordprocessingml.document`, extension: '.docx' },
    ],
    [
      `${GOOGLE_APPS_PREFIX}spreadsheet`,
      { mime: `${OFFICE}.spreadsheetml.sheet`, extension: '.xlsx' },
    ],
    [
      `${GOOGLE_APPS_PREFIX}presentation`,
      { mime: `${OFFICE}.presentationml.presentation`, extension: '.pptx' },
    ],
    [`${GOOGLE_APPS_PREFIX}drawing`, { mime: 'image/png', extension: '.png' }],
  ],
);

export interface DrivePage {
  readonly files: readonly DriveFile[];
  readonly next: string | null;
}

interface Folder {
  readonly name: string;
  readonly parent: string | null;
}

export class FolderTree {
  constructor(private readonly folders: ReadonlyMap<string, Folder>) {}

  pathOf(parents: readonly string[] | undefined): readonly string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    let at = parents?.[0];
    while (at !== undefined && !seen.has(at)) {
      seen.add(at);
      const folder = this.folders.get(at);
      if (folder === undefined) {
        break;
      }
      names.unshift(folder.name);
      at = folder.parent ?? undefined;
    }
    return names;
  }
}

function listUrl(query: string, cursor: string | null): string {
  const params = new URLSearchParams({
    q: query,
    fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
  });
  if (cursor !== null) {
    params.set('pageToken', cursor);
  }
  return `${DRIVE_API}/files?${params.toString()}`;
}

async function pageOf(http: GoogleHttp, query: string, cursor: string | null): Promise<DrivePage> {
  const page = await http.json(DRIVE_PAGE, listUrl(query, cursor));
  return { files: page.files, next: page.nextPageToken ?? null };
}

export async function loadFolderTree(http: GoogleHttp): Promise<FolderTree> {
  const folders = new Map<string, Folder>();
  let cursor: string | null = null;
  do {
    const page: DrivePage = await pageOf(
      http,
      `mimeType = '${GOOGLE_FOLDER_MIME}' and trashed = false`,
      cursor,
    );
    for (const folder of page.files) {
      folders.set(folder.id, { name: folder.name, parent: folder.parents?.[0] ?? null });
    }
    cursor = page.next;
  } while (cursor !== null);
  return new FolderTree(folders);
}

export function filePage(http: GoogleHttp, cursor: string | null): Promise<DrivePage> {
  return pageOf(http, `mimeType != '${GOOGLE_FOLDER_MIME}' and trashed = false`, cursor);
}

export interface DriveDownload {
  readonly name: string;
  readonly url: string;
}

export function downloadOf(file: DriveFile): DriveDownload | null {
  if (!file.mimeType.startsWith(GOOGLE_APPS_PREFIX)) {
    return { name: file.name, url: `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media` };
  }
  const target = EXPORTS.get(file.mimeType);
  if (target === undefined) {
    return null;
  }
  const params = new URLSearchParams({ mimeType: target.mime });
  return {
    name: file.name.endsWith(target.extension) ? file.name : `${file.name}${target.extension}`,
    url: `${DRIVE_API}/files/${encodeURIComponent(file.id)}/export?${params.toString()}`,
  };
}
