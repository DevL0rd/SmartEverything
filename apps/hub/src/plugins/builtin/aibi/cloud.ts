import { Resolver } from 'node:dns/promises';
import { Agent as HttpAgent, request as httpRequest, type OutgoingHttpHeaders } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { buffer } from 'node:stream/consumers';
import { AIBI_HOST } from './host-name';
import type { Message } from './connection';
import { FRAMING_HEADERS, flatHeaders, type Response } from './replies';

export type Scheme = 'http' | 'https';

export interface Cloud {
  readonly address: () => Promise<string>;
  readonly httpPort: number;
  readonly httpsPort: number;
  readonly ca?: string;
}

const RESOLVE_TIMEOUT_MS = 3000;
const RESOLVE_TRIES = 2;
const CLOUD_HTTP_PORT = 80;
const CLOUD_HTTPS_PORT = 443;
const IPV4 = 4;

class CloudAddressMissingError extends Error {
  override readonly name = 'CloudAddressMissingError';

  constructor(readonly dnsServer: string) {
    super(`${dnsServer} did not return an address for ${AIBI_HOST}`);
  }
}

export function cloudVia(dnsServer: string): Cloud {
  const resolver = new Resolver({ timeout: RESOLVE_TIMEOUT_MS, tries: RESOLVE_TRIES });
  resolver.setServers([dnsServer]);
  return {
    address: async (): Promise<string> => {
      const [found] = await resolver.resolve4(AIBI_HOST);
      if (found === undefined) {
        throw new CloudAddressMissingError(dnsServer);
      }
      return found;
    },
    httpPort: CLOUD_HTTP_PORT,
    httpsPort: CLOUD_HTTPS_PORT,
  };
}

function lookupVia(target: Cloud): LookupFunction {
  return (_host, _options, callback) => {
    target.address().then(
      (address) => {
        callback(null, address, IPV4);
      },
      (error: unknown) => {
        callback(error instanceof Error ? error : new Error(String(error)), '', IPV4);
      },
    );
  };
}

function agentFor(scheme: Scheme, target: Cloud): HttpAgent {
  const shared = { keepAlive: true, autoSelectFamily: false, lookup: lookupVia(target) };
  return scheme === 'https'
    ? new HttpsAgent({
        ...shared,
        servername: AIBI_HOST,
        minVersion: 'TLSv1.2',
        ...(target.ca === undefined ? {} : { ca: target.ca }),
      })
    : new HttpAgent(shared);
}

function headersOf(message: Message): OutgoingHttpHeaders {
  return Object.fromEntries(
    Object.entries(message.headers).filter(([name]) => !FRAMING_HEADERS.has(name)),
  );
}

export class Upstream {
  private readonly agent: HttpAgent;

  constructor(
    private readonly scheme: Scheme,
    private readonly target: Cloud,
  ) {
    this.agent = agentFor(scheme, target);
  }

  send(message: Message): Promise<Response> {
    const [method = 'GET', path = '/'] = message.startLine.split(' ');
    const https = this.scheme === 'https';
    return new Promise((resolve, reject) => {
      const send = https ? httpsRequest : httpRequest;
      const request = send(
        {
          host: AIBI_HOST,
          port: https ? this.target.httpsPort : this.target.httpPort,
          method,
          path,
          headers: headersOf(message),
          agent: this.agent,
        },
        (response) => {
          buffer(response).then((body) => {
            resolve({
              status: response.statusCode ?? 0,
              headers: flatHeaders(response.headers),
              body,
            });
          }, reject);
        },
      );
      request.on('error', reject);
      request.end(message.body);
    });
  }

  close(): void {
    this.agent.destroy();
  }
}
