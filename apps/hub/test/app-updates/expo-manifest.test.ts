import { randomUUID } from 'node:crypto';
import type { AppUpdateFile } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  expoAnswerFor,
  expoDirectiveFor,
  expoManifestFor,
  type AndroidAppUpdateEntry,
} from '../../src/app-updates/expo-manifest';
import type { ExpoRequest } from '../../src/app-updates/expo-request';

const HEX = 'ab'.repeat(32);

function file(path: string, sha256: string, extension?: string): AppUpdateFile {
  return {
    path,
    sha256,
    size: 10,
    contentType: path.endsWith('.hbc') ? 'application/javascript' : 'image/png',
    ...(extension === undefined ? {} : { fileExtension: extension }),
  };
}

function entry(overrides: Partial<AndroidAppUpdateEntry> = {}): AndroidAppUpdateEntry {
  return {
    id: randomUUID(),
    platform: 'android',
    channel: 'release',
    runtimeVersion: 'runtime-a',
    createdAt: '2026-10-25T08:00:00+07:00',
    appVersion: '1.2.3',
    notes: 'Fixed the banner.',
    launch: file('_expo/static/js/android/index-1.hbc', HEX),
    files: [file('assets/icon', 'cd'.repeat(32), '.png')],
    expoClient: { name: 'SmartEverything', slug: 'smarteverything' },
    withdrawn: null,
    ...overrides,
  };
}

function request(overrides: Partial<ExpoRequest> = {}): ExpoRequest {
  return {
    runtimeVersion: 'runtime-a',
    channel: 'release',
    key: null,
    download: null,
    currentUpdateId: null,
    expectsSignature: false,
    ...overrides,
  };
}

const LINK = (sha256: string): string => `/media/app-updates/${sha256}?expires=1&signature=ff`;

describe('choosing the answer to an update check', () => {
  it('offers the newest update of the runtime and channel', () => {
    const older = entry({ createdAt: '2026-10-24T08:00:00Z' });
    const newer = entry({ createdAt: '2026-10-25T08:00:00Z' });
    expect(expoAnswerFor([older, newer], request())).toStrictEqual({
      kind: 'manifest',
      entry: newer,
    });
  });

  it('says no update when the running update is the latest or none exists', () => {
    const latest = entry();
    expect(expoAnswerFor([latest], request({ currentUpdateId: latest.id }))).toStrictEqual({
      kind: 'noUpdateAvailable',
    });
    expect(expoAnswerFor([], request())).toStrictEqual({ kind: 'noUpdateAvailable' });
    expect(expoAnswerFor([entry({ runtimeVersion: 'runtime-b' })], request())).toStrictEqual({
      kind: 'noUpdateAvailable',
    });
    expect(expoAnswerFor([entry({ channel: 'dev' })], request())).toStrictEqual({
      kind: 'noUpdateAvailable',
    });
  });

  it('never serves a replacement bundle for a previously selected download', () => {
    const selected = entry({ createdAt: '2026-10-24T08:00:00Z' });
    const newer = entry({ createdAt: '2026-10-25T08:00:00Z' });
    const download = request({ download: selected.id });
    expect(expoAnswerFor([selected], download)).toStrictEqual({
      kind: 'manifest',
      entry: selected,
    });
    expect(expoAnswerFor([selected, newer], download)).toStrictEqual({ kind: 'noUpdateAvailable' });
    expect(expoAnswerFor([newer], download)).toStrictEqual({ kind: 'noUpdateAvailable' });
  });

  it('never offers a withdrawn update and rolls back when the running one was withdrawn', () => {
    const running = entry({ withdrawn: { at: '2026-10-25T09:30:00+07:00', reason: 'broken' } });
    expect(expoAnswerFor([running], request())).toStrictEqual({ kind: 'noUpdateAvailable' });
    expect(expoAnswerFor([running], request({ currentUpdateId: running.id }))).toStrictEqual({
      kind: 'rollBackToEmbedded',
      commitTime: '2026-10-25T02:30:00.000Z',
    });
  });

  it('offers the remaining update instead of rolling back when one is left', () => {
    const running = entry({ withdrawn: { at: '2026-10-25T09:30:00Z', reason: 'broken' } });
    const fallback = entry({ createdAt: '2026-10-25T09:40:00Z' });
    expect(
      expoAnswerFor([running, fallback], request({ currentUpdateId: running.id })),
    ).toStrictEqual({ kind: 'manifest', entry: fallback });
  });
});

describe('writing the manifest and directives', () => {
  it('writes the protocol 1 manifest with base64url hashes and absolute asset links', () => {
    const stored = entry();
    const manifest = expoManifestFor(stored, 'https://home.example', LINK);
    expect(manifest).toStrictEqual({
      id: stored.id,
      createdAt: '2026-10-25T01:00:00.000Z',
      runtimeVersion: 'runtime-a',
      launchAsset: {
        hash: Buffer.from(HEX, 'hex').toString('base64url'),
        key: 'index-1.hbc',
        contentType: 'application/javascript',
        url: `https://home.example/media/app-updates/${HEX}?expires=1&signature=ff`,
      },
      assets: [
        {
          hash: Buffer.from('cd'.repeat(32), 'hex').toString('base64url'),
          key: 'icon',
          contentType: 'image/png',
          fileExtension: '.png',
          url: `https://home.example/media/app-updates/${'cd'.repeat(32)}?expires=1&signature=ff`,
        },
      ],
      metadata: {},
      extra: {
        expoClient: { name: 'SmartEverything', slug: 'smarteverything' },
        smarteverything: { appVersion: '1.2.3', notes: 'Fixed the banner.' },
      },
    });
    expect(manifest.launchAsset.hash).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it('keeps a port in the public origin', () => {
    const manifest = expoManifestFor(entry({}), 'http://192.168.1.5:8443', LINK);
    expect(manifest.launchAsset.url.startsWith('http://192.168.1.5:8443/media/')).toBe(true);
  });

  it('writes the two directives exactly', () => {
    expect(expoDirectiveFor({ kind: 'noUpdateAvailable' })).toStrictEqual({
      type: 'noUpdateAvailable',
    });
    expect(
      expoDirectiveFor({ kind: 'rollBackToEmbedded', commitTime: '2026-10-25T02:30:00.000Z' }),
    ).toStrictEqual({
      type: 'rollBackToEmbedded',
      parameters: { commitTime: '2026-10-25T02:30:00.000Z' },
    });
  });
});
