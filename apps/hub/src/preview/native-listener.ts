import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { ApiError } from '@smarteverything/domain';
export async function listenerIdentity(origin: string): Promise<string> {
  const url = new URL(origin);
  const port = url.port === '' ? (url.protocol === 'https:' ? 443 : 80) : Number(url.port);
  if (platform() === 'darwin') return macListener(port);
  if (platform() !== 'linux')
    throw new ApiError('conflict', 'This computer has no native service-publication adapter.');
  const ipv6 = url.hostname === '[::1]';
  const content = await readFile(ipv6 ? '/proc/net/tcp6' : '/proc/net/tcp', 'utf8');
  const suffix = port.toString(16).toUpperCase().padStart(4, '0');
  const addresses = ipv6
    ? ['00000000000000000000000001000000', '00000000000000000000000000000000']
    : ['0100007F', '00000000'];
  const entries = content
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/));
  const listeners = entries.filter(
    (parts) =>
      parts[3] === '0A' && addresses.some((address) => parts[1] === `${address}:${suffix}`),
  );
  const identity = listeners
    .map((parts) => parts[9])
    .filter((v) => v !== undefined)
    .sort()
    .join(':');
  if (identity === '')
    throw new ApiError(
      'conflict',
      'The exact loopback service is offline; start it before sharing.',
    );
  return identity;
}
function macListener(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/sbin/lsof',
      ['-nP', `-iTCP:${String(port)}`, '-sTCP:LISTEN', '-FpiF'],
      { timeout: 5000, maxBuffer: 16 * 1024 },
      (error, stdout) => {
        if (error !== null) {
          reject(
            new ApiError(
              'conflict',
              'The native listener identity could not be verified for this service.',
            ),
          );
          return;
        }
        const identity = stdout
          .split('\n')
          .filter((v) => /^(?:[pi][0-9]+|F0x[a-f0-9]+)$/i.test(v))
          .sort()
          .join(':');
        if (identity === '')
          reject(new ApiError('conflict', 'The exact loopback service is offline.'));
        else resolve(identity);
      },
    );
  });
}
