import { execFileSync } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ApiError,
  MACHINE_UPDATE_UPLOAD_PATH,
  createClientToken,
  hashClientToken,
  matchPath,
  type Role,
} from '@smarteverything/domain';
import { authenticate } from '../../src/server/auth';
import { parseJsonBody, readBody, sendError, sendJson, BODY_LIMIT } from '../../src/server/http';
import { assertOwnerRoute } from '../../src/server/owner-route';
import { MediaLinks } from '../../src/server/media-links';
import {
  MachineUpdatePublisher,
  machineUpdateUploadRoute,
} from '../../src/updates/machine-update-publication';
import { machineUpdateEndpoints } from '../../src/updates/extension';
import { MachineUpdates } from '../../src/updates/machine-updates';
import { ReleaseFolder } from '../../src/updates/release-folder';
import type { HubLayout } from '../../src/data-layout';
import { testLogger } from './logs';
import { testStore, type TestStore } from './store';

export interface MachineUpdateHub {
  readonly url: URL;
  readonly pin: string | undefined;
  readonly layout: HubLayout;
  readonly folder: ReleaseFolder;
  readonly publisher: MachineUpdatePublisher;
  readonly updates: MachineUpdates;
  readonly tokenFor: (role: Role) => string;
  readonly close: () => Promise<void>;
}

export async function certificate(): Promise<{
  readonly directory: string;
  readonly key: string;
  readonly cert: string;
  readonly pin: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'machine-update-tls-'));
  const keyFile = join(directory, 'key.pem');
  const certFile = join(directory, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-keyout',
      keyFile,
      '-out',
      certFile,
      '-subj',
      '/CN=127.0.0.1',
      '-days',
      '1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  const cert = await readFile(certFile, 'utf8');
  const spki = new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' });
  return {
    directory,
    key: await readFile(keyFile, 'utf8'),
    cert,
    pin: createHash('sha256').update(spki).digest('hex'),
  };
}

export class ListeningAddressError extends Error {
  override readonly name = 'ListeningAddressError';

  constructor() {
    super('The test hub server has no TCP address.');
  }
}

interface Wiring {
  readonly store: TestStore['store'];
  readonly publisher: MachineUpdatePublisher;
  readonly updates: MachineUpdates;
}

function requestListener(
  wiring: Wiring,
): (request: IncomingMessage, response: ServerResponse) => void {
  const { store, publisher, updates } = wiring;
  const endpoints = Object.values(machineUpdateEndpoints(updates, publisher));
  const upload = machineUpdateUploadRoute(store, publisher);
  const log = testLogger('machine-update-hub');
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
    const params = matchPath(MACHINE_UPDATE_UPLOAD_PATH, url.pathname);
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

export function tokenIssuer(store: TestStore['store']): (role: Role) => string {
  const tokens = new Map<Role, string>();
  return (role): string => {
    const known = tokens.get(role);
    if (known !== undefined) return known;
    const token = createClientToken();
    store.clients.create({
      name: role,
      platform: 'web',
      role,
      tokenHash: hashClientToken(token),
    });
    tokens.set(role, token);
    return token;
  };
}

export async function startMachineUpdateHub(options: {
  readonly tls: boolean;
}): Promise<MachineUpdateHub> {
  const opened: TestStore = await testStore();
  const { store, layout } = opened;
  const folder = new ReleaseFolder(layout);
  const publisher = new MachineUpdatePublisher(layout, folder);
  const updates = new MachineUpdates(folder, new MediaLinks(() => new Date()));
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
    publisher,
    updates,
    tokenFor: tokenIssuer(store),
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await opened.close();
      if (secure !== null) await rm(secure.directory, { recursive: true, force: true });
    },
  };
}
