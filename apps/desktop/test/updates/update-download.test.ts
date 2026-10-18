import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MachineUpdateOfferArtifact } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { downloadArtifact } from '../../src/updates/update-download.js';
import {
  UpdateServerRefusedError,
  UpdateVerificationError,
} from '../../src/updates/update-errors.js';

const BYTES = Buffer.from('the new app, zipped');

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'update-download-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function artifact(overrides: Partial<MachineUpdateOfferArtifact> = {}): MachineUpdateOfferArtifact {
  return {
    platform: 'linux',
    arch: 'x64',
    kind: 'zip',
    file: 'app.zip',
    sha256: createHash('sha256').update(BYTES).digest('hex'),
    size: BYTES.length,
    url: '/media/machine-updates/app.zip?expires=1&signature=ab',
    ...overrides,
  };
}

function serving(response: () => Response): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    fetch: (input): Promise<Response> => {
      urls.push(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(response());
    },
  };
}

describe('downloading an update from the home', () => {
  it('keeps the verified file under its own name next to nothing else', async () => {
    const { fetch, urls } = serving(() => new Response(BYTES));
    const file = await downloadArtifact(artifact(), 'https://home.example:7880', directory, fetch);
    expect(file).toBe(join(directory, 'app.zip'));
    expect(await readFile(file)).toStrictEqual(BYTES);
    expect(await readdir(directory)).toStrictEqual(['app.zip']);
    expect(urls[0]).toBe(
      'https://home.example:7880/media/machine-updates/app.zip?expires=1&signature=ab',
    );
  });

  it('rejects and removes a file of the wrong size', async () => {
    const { fetch } = serving(() => new Response(BYTES));
    await expect(
      downloadArtifact(
        artifact({ size: BYTES.length + 1 }),
        'https://home.example',
        directory,
        fetch,
      ),
    ).rejects.toThrow(UpdateVerificationError);
    expect(await readdir(directory)).toStrictEqual([]);
  });

  it('rejects and removes a file with another checksum', async () => {
    const { fetch } = serving(() => new Response(BYTES));
    await expect(
      downloadArtifact(
        artifact({ sha256: 'f'.repeat(64) }),
        'https://home.example',
        directory,
        fetch,
      ),
    ).rejects.toThrow(/checksum/u);
    expect(await readdir(directory)).toStrictEqual([]);
  });

  it('names the status when the home refuses the download', async () => {
    const { fetch } = serving(() => new Response('gone', { status: 410 }));
    await expect(
      downloadArtifact(artifact(), 'https://home.example', directory, fetch),
    ).rejects.toThrow(UpdateServerRefusedError);
  });
});
