import { lookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { once } from 'node:events';
import { createServer, type Server } from 'node:https';
import { generate } from 'selfsigned';
import { Agent, setGlobalDispatcher } from 'undici';

export const REMOTE_HOST = 'home.test';

export interface RemoteHub {
  readonly server: Server;
  readonly port: number;
  readonly url: string;
  readonly close: () => Promise<void>;
}

interface Identity {
  readonly cert: string;
  readonly key: string;
}

type Answer = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

let identity: Promise<Identity> | undefined;

function resolveHost(hostname: string, options: LookupOptions, answer: Answer): void {
  if (hostname !== REMOTE_HOST) {
    lookup(hostname, options, answer);
    return;
  }
  if (options.all === true) answer(null, [{ address: '127.0.0.1', family: 4 }]);
  else answer(null, '127.0.0.1', 4);
}

function connectOf(ca: string): Agent.Options['connect'] & object {
  return { ca, lookup: resolveHost };
}

export async function remoteConnect(): Promise<Agent.Options['connect'] & object> {
  return connectOf((await issued()).cert);
}

function issued(): Promise<Identity> {
  identity ??= generate([{ name: 'commonName', value: REMOTE_HOST }], {
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: REMOTE_HOST }] }],
  }).then((pair) => {
    setGlobalDispatcher(new Agent({ connect: connectOf(pair.cert) }));
    return { cert: pair.cert, key: pair.private };
  });
  return identity;
}

export async function listenRemote(
  handler: Parameters<typeof createServer>[1],
): Promise<RemoteHub> {
  const { cert, key } = await issued();
  const server = createServer({ key, cert }, handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Remote hub has no port');
  return {
    server,
    port: address.port,
    url: `https://${REMOTE_HOST}:${String(address.port)}`,
    close: async (): Promise<void> => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
