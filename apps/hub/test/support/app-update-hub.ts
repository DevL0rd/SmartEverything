import { rm } from 'node:fs/promises';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import {
  API_ENDPOINTS as E,
  APP_UPDATE_BLOB_UPLOAD_PATH,
  ApiError,
  matchPath,
  type Role,
} from '@smarteverything/domain';
import { AppUpdates } from '../../src/app-updates/app-updates';
import {
  AppUpdatePublisher,
  appUpdatePublicationEndpoints,
  appUpdateUploadRoute,
} from '../../src/app-updates/publication';
import { AppUpdateFolder } from '../../src/app-updates/update-folder';
import type { HubLayout } from '../../src/data-layout';
import { authenticate } from '../../src/server/auth';
import { parseJsonBody, readBody, sendError, sendJson, BODY_LIMIT } from '../../src/server/http';
import { MediaLinks } from '../../src/server/media-links';
import { assertOwnerRoute } from '../../src/server/owner-route';
import { bound } from '../../src/server/router';
import { testLogger } from './logs';
import { ListeningAddressError, certificate, tokenIssuer } from './machine-update-hub';
import { testStore, type TestStore } from './store';

export interface AppUpdateHub {
  readonly url: URL;
  readonly pin: string | undefined;
  readonly layout: HubLayout;
  readonly folder: AppUpdateFolder;
  readonly updates: AppUpdates;
  readonly setNow: (now: Date) => void;
  readonly tokenFor: (role: Role) => string;
  readonly close: () => Promise<void>;
}

interface Wiring {
  readonly store: TestStore['store'];
  readonly publisher: AppUpdatePublisher;
  readonly updates: AppUpdates;
}

function requestListener(
  wiring: Wiring,
): (request: IncomingMessage, response: ServerResponse) => void {
  const { store, publisher, updates } = wiring;
  const endpoints = [
    ...Object.values(appUpdatePublicationEndpoints(publisher)),
    bound(E.listAppUpdates, () => updates.list()),
  ];
  const upload = appUpdateUploadRoute(store, publisher);
  const log = testLogger('app-update-hub');
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://hub');
    const entry = endpoints.find(
      ({ endpoint }) => endpoint.method === request.method && endpoint.path === url.pathname,
    );
    if (entry !== undefined) {
      const caller = authenticate(store, request, entry.endpoint.access, false);
      assertOwnerRoute(store, caller, entry.endpoint);
      const body = parseJsonBody(request, await readBody(request, BODY_LIMIT));
      const result = await entry.run(
        caller,
        {
          params: {},
          query: Object.fromEntries(url.searchParams),
          body,
          remote: '127.0.0.1',
          headers: request.headers,
        },
        log,
      );
      sendJson(response, 200, result);
      return;
    }
    const params = matchPath(APP_UPDATE_BLOB_UPLOAD_PATH, url.pathname);
    if (request.method !== 'PUT' || params === null) {
      throw new ApiError('not_found', 'There is no route at this address.');
    }
    await upload.handle(request, response, params);
  };
  return (request, response): void => {
    handle(request, response).catch((cause: unknown) => {
      if (cause instanceof ApiError) sendError(response, cause);
      else {
        response.writeHead(500).end();
        throw cause;
      }
    });
  };
}

export async function startAppUpdateHub(options: { readonly tls: boolean }): Promise<AppUpdateHub> {
  const opened: TestStore = await testStore();
  const { store, layout } = opened;
  let now = new Date('2026-10-25T10:00:00.000Z');
  const folder = new AppUpdateFolder(layout);
  const links = new MediaLinks(() => new Date());
  const publisher = new AppUpdatePublisher(layout, folder, () => now, testLogger('app-update-hub'));
  const updates = new AppUpdates(folder, links, testLogger('app-update-hub'));
  const listener = requestListener({ store, publisher, updates });
  const secure = options.tls ? await certificate() : null;
  const server =
    secure === null
      ? createHttpServer(listener)
      : createHttpsServer({ key: secure.key, cert: secure.cert }, listener);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new ListeningAddressError();
  return {
    url: new URL(`${secure === null ? 'http' : 'https'}://127.0.0.1:${String(address.port)}`),
    pin: secure?.pin,
    layout,
    folder,
    updates,
    setNow: (next): void => {
      now = next;
    },
    tokenFor: tokenIssuer(store),
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await opened.close();
      if (secure !== null) await rm(secure.directory, { recursive: true, force: true });
    },
  };
}
