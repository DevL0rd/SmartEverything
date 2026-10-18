import { createHash, generateKeyPairSync, randomBytes, X509Certificate } from 'node:crypto';
import { createServer, type Server } from 'node:https';
import { once } from 'node:events';
import { generate } from 'selfsigned';
import { NATIVE_HUB_TRUST, type NativeHubTrust } from '@smarteverything/domain';

export interface HubKey {
  readonly privateKey: string;
  readonly publicKey: string;
}
export interface HubCertificate {
  readonly key: HubKey;
  readonly cert: string;
  readonly serverName: string;
}
export interface PinnedHub {
  readonly server: Server;
  readonly port: number;
  readonly url: string;
  readonly connections: () => number;
  readonly close: () => Promise<void>;
}
const DAY_MS = 86_400_000;

export function newKey(): HubKey {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey: pair.privateKey, publicKey: pair.publicKey };
}
export function newServerName(): string {
  return `smarteverything-${randomBytes(16).toString('hex')}.local`;
}
export async function issueCertificate(
  key: HubKey,
  serverName: string,
  validity: { readonly from: number; readonly to: number } = {
    from: Date.now() - DAY_MS,
    to: Date.now() + 365 * DAY_MS,
  },
): Promise<HubCertificate> {
  const pair = await generate([{ name: 'commonName', value: serverName }], {
    keyPair: key,
    algorithm: 'sha256',
    notBeforeDate: new Date(validity.from),
    notAfterDate: new Date(validity.to),
  });
  return { key, cert: pair.cert, serverName };
}
function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
export function trustFor(
  certificate: HubCertificate,
  port: number,
  scopeId = 'scope-1',
  extraAddresses: readonly string[] = [],
): NativeHubTrust {
  const x509 = new X509Certificate(certificate.cert);
  const publicKeySha256 = digest(x509.publicKey.export({ type: 'spki', format: 'der' }));
  return NATIVE_HUB_TRUST.parse({
    scopeId,
    identity: {
      id: publicKeySha256,
      protocolVersion: 1,
      name: 'Test hub',
      tls: {
        serverName: certificate.serverName,
        publicKeySha256,
        certificateSha256: digest(x509.raw),
      },
    },
    endpoints: [
      { kind: 'lan', url: `https://127.0.0.1:${String(port)}` },
      ...extraAddresses.map((address) => ({
        kind: 'lan' as const,
        url: `https://${address}:${String(port)}`,
      })),
    ],
    lanAddresses: ['127.0.0.1', ...extraAddresses],
  });
}
export async function listenPinned(
  certificate: HubCertificate,
  handler: Parameters<typeof createServer>[1],
): Promise<PinnedHub> {
  let connections = 0;
  const server = createServer({ key: certificate.key.privateKey, cert: certificate.cert }, handler);
  server.on('secureConnection', () => {
    connections += 1;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Fixture hub has no port');
  const port = address.port;
  return {
    server,
    port,
    url: `https://127.0.0.1:${String(port)}`,
    connections: (): number => connections,
    close: async (): Promise<void> => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
