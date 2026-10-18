import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { connect } from 'node:tls';
import { Agent, fetch as undiciFetch } from 'undici';

class HubPinMismatchError extends Error {
  override readonly name = 'HubPinMismatchError';
  constructor() {
    super('The hub certificate does not match the pin printed with the pairing code.');
  }
}

function pinnedAgent(pin: string): Agent {
  return new Agent({
    connect: (options, callback): void => {
      const socket = connect({
        host: options.hostname,
        port: Number(options.port),
        ...(isIP(options.hostname) === 0 ? { servername: options.hostname } : {}),
        rejectUnauthorized: false,
      });
      let settled = false;
      const settle = (cause: Error | null): void => {
        if (settled) return;
        settled = true;
        if (cause === null) callback(null, socket);
        else callback(cause, null);
      };
      socket.once('error', settle);
      socket.once('secureConnect', () => {
        const key = socket
          .getPeerX509Certificate()
          ?.publicKey.export({ type: 'spki', format: 'der' });
        if (key !== undefined && createHash('sha256').update(key).digest('hex') === pin)
          settle(null);
        else socket.destroy(new HubPinMismatchError());
      });
    },
  });
}

export function hubFetch(pin: string | undefined): typeof undiciFetch {
  if (pin === undefined) return undiciFetch;
  const dispatcher = pinnedAgent(pin);
  return (input, init) => undiciFetch(input, { ...init, dispatcher });
}
