import { randomUUID } from 'node:crypto';
import {
  DRIVE_API,
  GOOGLE_APPS_PREFIX,
  GOOGLE_FOLDER_MIME,
  PICKER_API,
  SCOPE_DRIVE_READONLY,
  SCOPE_PHOTOS_PICKER,
} from '../../../src/drive/google/scopes';
import type { FetchLike } from '../../../src/plugins/builtin/fetch-like';
import {
  bytesOf,
  failure,
  jsonReply,
  type Bytes,
  type FakeDriveFile,
  type FilePlacement,
} from './content';
import { listFiles, mediaOf, type DriveState } from './drive-routes';
import { FakeOAuth } from './oauth';
import {
  MEDIA_HOST,
  closeSession,
  createSession,
  downloadPicked,
  listPicked,
  readSession,
  type PickerState,
  type PickSpec,
} from './picker-routes';

export { DRIVE_CLIENT } from './oauth';
export type { PickSpec } from './picker-routes';
export { bytesOf } from './content';

export interface RecordedRequest {
  readonly method: string;
  readonly host: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly status: number;
}

const MODIFIED = '2026-01-02T03:04:05.000Z';

interface Counter {
  readonly after: number;
  served: number;
}

interface Failing extends Counter {
  readonly status: number;
}

function parentsOf(placement: FilePlacement): readonly string[] | undefined {
  return placement.parentId === undefined ? undefined : [placement.parentId];
}

export class FakeGoogleDrive {
  readonly oauth = new FakeOAuth();
  readonly requests: RecordedRequest[] = [];
  private readonly drive: DriveState = { files: new Map(), pageSize: 2 };
  private readonly picker: PickerState = {
    sessions: new Map(),
    choices: [],
    pageSize: 2,
    timeoutSeconds: 600,
  };
  private failing: Failing | null = null;
  private expiring: Counter | null = null;
  private staged: readonly PickSpec[] = [];

  readonly fetch: FetchLike = (input, init) =>
    new Promise((resolve) => {
      const response = this.route(input, init);
      const url = new URL(input);
      this.requests.push({
        method: (init.method ?? 'GET').toUpperCase(),
        host: url.host,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        status: response.status,
      });
      resolve(response);
    });

  addFolder(name: string, parentId?: string): string {
    return this.add({
      name,
      mimeType: GOOGLE_FOLDER_MIME,
      parents: parentsOf({ name, ...(parentId === undefined ? {} : { parentId }) }),
      modifiedTime: MODIFIED,
      content: null,
      exports: new Map(),
    });
  }

  addFile(placement: FilePlacement, text: string): string {
    return this.add({
      name: placement.name,
      mimeType: 'application/octet-stream',
      parents: parentsOf(placement),
      modifiedTime: placement.modifiedTime ?? MODIFIED,
      content: bytesOf(text),
      exports: new Map(),
    });
  }

  addDocument(
    placement: FilePlacement,
    kind: string,
    exported: ReadonlyMap<string, string>,
  ): string {
    return this.add({
      name: placement.name,
      mimeType: `${GOOGLE_APPS_PREFIX}${kind}`,
      parents: parentsOf(placement),
      modifiedTime: placement.modifiedTime ?? MODIFIED,
      content: null,
      exports: new Map<string, Bytes>([...exported].map(([mime, text]) => [mime, bytesOf(text)])),
    });
  }

  pickLater(specs: readonly PickSpec[]): void {
    this.staged = specs;
  }

  choose(): void {
    this.picker.choices.push(...this.staged);
    for (const session of this.picker.sessions.values()) {
      session.picked = true;
    }
  }

  failMediaAfter(count: number, status: number): void {
    this.failing = { after: count, status, served: 0 };
  }

  expireAccessAfterMedia(count: number): void {
    this.expiring = { after: count, served: 0 };
  }

  heal(): void {
    this.failing = null;
  }

  setPageSize(size: number): void {
    this.drive.pageSize = size;
    this.picker.pageSize = size;
  }

  openSessions(): number {
    return this.picker.sessions.size;
  }

  mediaRequests(): readonly RecordedRequest[] {
    return this.requests.filter(
      (request) =>
        request.host === MEDIA_HOST ||
        request.query['alt'] === 'media' ||
        request.path.endsWith('/export'),
    );
  }

  private add(file: Omit<FakeDriveFile, 'id'>): string {
    const id = `file-${randomUUID()}`;
    this.drive.files.set(id, { id, ...file });
    return id;
  }

  private guarded(headers: Headers, scope: string, serve: () => Response): Response {
    return this.oauth.allows(headers, scope) ? serve() : failure(401);
  }

  private media(headers: Headers, scope: string, serve: () => Response): Response {
    if (this.failing !== null && this.failing.served >= this.failing.after) {
      return failure(this.failing.status);
    }
    const reply = this.guarded(headers, scope, serve);
    if (this.failing !== null && reply.ok) {
      this.failing.served += 1;
    }
    if (this.expiring !== null && reply.ok) {
      this.expiring.served += 1;
      if (this.expiring.served === this.expiring.after) {
        this.oauth.expireAccess();
      }
    }
    return reply;
  }

  private driveReply(url: URL, headers: Headers): Response {
    const path = url.pathname.slice('/drive/v3'.length);
    const one = /^\/files\/([^/]+)$/.exec(path);
    const exported = /^\/files\/([^/]+)\/export$/.exec(path);
    if (path === '/files') {
      return this.guarded(headers, SCOPE_DRIVE_READONLY, () =>
        listFiles(this.drive, url.searchParams),
      );
    }
    if (one !== null && url.searchParams.get('alt') === 'media') {
      return this.media(headers, SCOPE_DRIVE_READONLY, () =>
        mediaOf(this.drive, decodeURIComponent(one[1] ?? ''), null),
      );
    }
    if (exported !== null) {
      const mime = url.searchParams.get('mimeType');
      return this.media(headers, SCOPE_DRIVE_READONLY, () =>
        mediaOf(this.drive, decodeURIComponent(exported[1] ?? ''), mime),
      );
    }
    return failure(404);
  }

  private pickerReply(url: URL, method: string, headers: Headers): Response {
    const path = url.pathname.slice('/v1'.length);
    const one = /^\/sessions\/([^/]+)$/.exec(path);
    return this.guarded(headers, SCOPE_PHOTOS_PICKER, () => {
      if (path === '/sessions' && method === 'POST') {
        return createSession(this.picker);
      }
      if (path === '/mediaItems') {
        return listPicked(this.picker, url.searchParams);
      }
      if (one === null) {
        return failure(404);
      }
      const id = decodeURIComponent(one[1] ?? '');
      return method === 'DELETE' ? closeSession(this.picker, id) : readSession(this.picker, id);
    });
  }

  private mediaHostReply(url: URL, headers: Headers): Response {
    const match = /^\/pk\/([^=]+)=(d|dv)$/.exec(url.pathname);
    if (match === null) {
      return failure(404);
    }
    return this.media(headers, SCOPE_PHOTOS_PICKER, () =>
      downloadPicked(this.picker, match[1] ?? '', match[2] ?? ''),
    );
  }

  private tokenReply(path: string, method: string, body: string): Response {
    if (method !== 'POST') {
      return failure(405);
    }
    const form = new URLSearchParams(body);
    const reply = path === '/token' ? this.oauth.token(form) : this.oauth.revoke(form);
    return jsonReply(reply.status, reply.body);
  }

  private route(input: string, init: RequestInit): Response {
    const url = new URL(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const prefix = (depth: number): string =>
      `${url.origin}${url.pathname.split('/').slice(0, depth).join('/')}`;
    if (url.host === 'oauth2.googleapis.com') {
      return this.tokenReply(
        url.pathname,
        method,
        init.body instanceof URLSearchParams ? init.body.toString() : '',
      );
    }
    if (prefix(3) === DRIVE_API) {
      return this.driveReply(url, headers);
    }
    if (prefix(2) === PICKER_API) {
      return this.pickerReply(url, method, headers);
    }
    if (url.host === MEDIA_HOST) {
      return this.mediaHostReply(url, headers);
    }
    throw new Error(`The fake Google has no host ${url.host}.`);
  }
}

export function createFakeGoogleDrive(): FakeGoogleDrive {
  return new FakeGoogleDrive();
}
