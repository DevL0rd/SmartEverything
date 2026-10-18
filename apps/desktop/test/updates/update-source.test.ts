import { describe, expect, it } from 'vitest';
import { readOffer, updateTargetOf } from '../../src/updates/update-source.js';

const OFFER = {
  version: '0.4.2',
  artifacts: [
    {
      platform: 'linux',
      arch: 'x64',
      kind: 'zip',
      file: 'app.zip',
      sha256: 'a'.repeat(64),
      size: 10,
      url: '/media/machine-updates/app.zip?expires=1&signature=ab',
    },
  ],
  expiresAt: '2026-10-18T10:10:00.000Z',
};

const SERVER = { url: 'https://home.example:7880', token: 'set_token' };

function answering(status: number, body: unknown): { fetch: typeof fetch; seen: Request[] } {
  const seen: Request[] = [];
  return {
    seen,
    fetch: (input, init): Promise<Response> => {
      seen.push(new Request(input, init));
      return Promise.resolve(Response.json(body, { status }));
    },
  };
}

describe('asking the home for an update', () => {
  it('sends the platform and architecture with the window token', async () => {
    const { fetch, seen } = answering(200, OFFER);
    const offer = await readOffer(SERVER, { platform: 'linux', arch: 'x64' }, fetch);
    expect(offer?.version).toBe('0.4.2');
    expect(seen[0]?.url).toBe(
      'https://home.example:7880/api/machine-update?platform=linux&arch=x64',
    );
    expect(seen[0]?.headers.get('authorization')).toBe('Bearer set_token');
  });

  it('returns null while the home stores no release', async () => {
    const { fetch } = answering(200, null);
    expect(await readOffer(SERVER, { platform: 'linux', arch: 'x64' }, fetch)).toBeNull();
  });

  it('turns a refusal into the home’s own error', async () => {
    const { fetch } = answering(403, { error: { code: 'forbidden', message: 'Not allowed.' } });
    await expect(readOffer(SERVER, { platform: 'linux', arch: 'x64' }, fetch)).rejects.toThrow(
      'Not allowed.',
    );
  });

  it('rejects an offer the contract does not describe', async () => {
    const { fetch } = answering(200, { version: 'x' });
    await expect(readOffer(SERVER, { platform: 'linux', arch: 'x64' }, fetch)).rejects.toThrow();
  });
});

describe('which release files fit this computer', () => {
  it('knows linux, windows and macOS on the two common processors', () => {
    expect(updateTargetOf('linux', 'x64')).toStrictEqual({ platform: 'linux', arch: 'x64' });
    expect(updateTargetOf('darwin', 'arm64')).toStrictEqual({ platform: 'darwin', arch: 'arm64' });
  });

  it('offers nothing for other systems or processors', () => {
    expect(updateTargetOf('freebsd', 'x64')).toBeNull();
    expect(updateTargetOf('linux', 'ia32')).toBeNull();
  });
});
