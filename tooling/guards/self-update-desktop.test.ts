import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SELF_UPDATE_DESKTOP_INPUT,
  type MachineUpdateManifest,
  type DesktopReleaseInput,
} from '@smarteverything/domain';
import { useBuildHost } from './build-host-fixture.ts';
import { makeCommand, shellCommand, zipDirectory } from '../self-update-desktop-command.ts';
import {
  DesktopReleaseConflict,
  readDesktopRelease,
  runDesktopRelease,
  type DesktopReleasePorts,
} from '../self-update-desktop.ts';
import { readJob, startJob } from '../self-update-job.ts';

const COMMIT = 'a'.repeat(40);
const SHA = 'b'.repeat(64);

function manifest(version: string, arches: readonly ('x64' | 'arm64')[]): MachineUpdateManifest {
  return {
    version,
    artifacts: arches.map((arch) => ({
      platform: 'linux',
      arch,
      kind: 'zip',
      file: `SmartEverything-linux-${arch}-${version}.zip`,
      sha256: SHA,
      size: 10,
    })),
  };
}

let folder: string;
let published: MachineUpdateManifest | null;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'self-update-desktop-'));
  published = manifest('0.1.13', ['x64']);
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function inputOf(arches: DesktopReleaseInput['arches'] = ['x64']): DesktopReleaseInput {
  return SELF_UPDATE_DESKTOP_INPUT.parse({
    action: 'desktop',
    runId: randomUUID(),
    notes: 'Planner and Clock',
    arches,
  });
}

function portsOf(input: DesktopReleaseInput, version = '0.1.14'): DesktopReleasePorts {
  return {
    store: { folder, now: () => new Date('2026-11-14T10:00:00Z'), newId: () => input.runId },
    sync: () => Promise.resolve(COMMIT),
    version: () => version,
    current: () => Promise.resolve(published),
    prepare: () => Promise.resolve('runtime-1'),
    build: (arch) => Promise.resolve(`/out/${arch}/SmartEverything-linux-${arch}.zip`),
    publish: vi.fn((next: string, files: readonly { readonly arch: string }[]) => {
      published = manifest(
        next,
        files.map((file) => (file.arch === 'arm64' ? 'arm64' : 'x64')),
      );
      return Promise.resolve(published);
    }),
  };
}

describe('the desktop release', () => {
  it('publishes one zip per requested architecture and records the commit', async () => {
    const input = inputOf(['x64', 'arm64']);
    const ports = portsOf(input);
    const result = await runDesktopRelease(input, ports);
    expect(result.status).toBe('published');
    if (result.status !== 'published') return;
    expect(result.release.commit).toBe(COMMIT);
    expect(result.release.manifest.artifacts.map((artifact) => artifact.arch)).toEqual([
      'x64',
      'arm64',
    ]);
    expect(ports.publish).toHaveBeenCalledExactlyOnceWith(
      '0.1.14',
      [
        {
          platform: 'linux',
          arch: 'x64',
          kind: 'zip',
          path: '/out/x64/SmartEverything-linux-x64.zip',
        },
        {
          platform: 'linux',
          arch: 'arm64',
          kind: 'zip',
          path: '/out/arm64/SmartEverything-linux-arm64.zip',
        },
      ],
      { notes: 'Planner and Clock', runtimeVersion: 'runtime-1' },
    );
    expect(readJob(ports.store, input.runId)?.steps).toContain(`publishing commit ${COMMIT}`);
  });

  it('refuses a version that is not newer and builds nothing', async () => {
    const input = inputOf();
    const prepare = vi.fn(() => Promise.resolve('runtime-1'));
    const result = await runDesktopRelease(input, { ...portsOf(input, '0.1.13'), prepare });
    expect(result).toMatchObject({ status: 'refused' });
    expect(result.status === 'refused' ? result.reason : '').toMatch(
      /^version_not_newer: .*0\.1\.13/u,
    );
    expect(prepare).not.toHaveBeenCalled();
  });

  it('refuses with the reason when the checkout cannot be synced', async () => {
    const input = inputOf();
    const result = await runDesktopRelease(input, {
      ...portsOf(input),
      sync: () => Promise.reject(new Error('commit and push first')),
    });
    expect(result).toEqual({
      status: 'refused',
      runId: input.runId,
      reason: 'preflight: commit and push first',
    });
    expect(readJob(portsOf(input).store, input.runId)?.phase).toBe('refused');
  });

  it('records a build failure with its detail and keeps the steps taken', async () => {
    const input = inputOf();
    const ports = portsOf(input);
    const result = await runDesktopRelease(input, {
      ...ports,
      build: () => Promise.reject(new Error('package failed:\nENOSPC')),
    });
    expect(result).toEqual({
      status: 'failed',
      runId: input.runId,
      reason: 'package failed:\nENOSPC',
    });
    const job = readJob(ports.store, input.runId);
    expect(job?.phase).toBe('failed');
    expect(job?.steps).toEqual([
      `publishing commit ${COMMIT}`,
      'built the web bundle and the desktop shell',
    ]);
  });

  it('fails when the hub does not report the published release as current', async () => {
    const input = inputOf();
    const result = await runDesktopRelease(input, {
      ...portsOf(input),
      current: vi
        .fn()
        .mockResolvedValueOnce(manifest('0.1.13', ['x64']))
        .mockResolvedValueOnce(manifest('0.1.13', ['x64'])),
    });
    expect(result.status).toBe('failed');
    expect(result.status === 'failed' ? result.reason : '').toContain('0.1.14');
  });

  it('answers a repeated request from its job and refuses a different request on the same ID', async () => {
    const input = inputOf();
    const ports = portsOf(input);
    const first = await runDesktopRelease(input, ports);
    const again = await runDesktopRelease(input, ports);
    expect(again).toEqual(first);
    expect(ports.publish).toHaveBeenCalledOnce();
    await expect(
      runDesktopRelease({ ...input, notes: 'Different notes' }, ports),
    ).rejects.toBeInstanceOf(DesktopReleaseConflict);
  });

  it('reads a finished release by its run ID and ends an unfinished one as failed', async () => {
    const input = inputOf();
    const ports = portsOf(input);
    expect(readDesktopRelease(input.runId, ports.store)).toBeNull();
    startJob(ports.store, 'desktop', input, null);
    expect(readDesktopRelease(input.runId, ports.store)).toMatchObject({ status: 'failed' });
    expect(readJob(ports.store, input.runId)?.phase).toBe('failed');
    const done = inputOf();
    const finished = await runDesktopRelease(done, portsOf(done));
    expect(readDesktopRelease(done.runId, portsOf(done).store)).toEqual(finished);
  });
});

describe('the desktop build commands', () => {
  useBuildHost();

  it('builds the release variant of each architecture into its own folder', () => {
    const command = makeCommand('/checkout', 'arm64');
    expect(command.args).toEqual([
      '--filter',
      '@smarteverything/desktop',
      'exec',
      'electron-forge',
      'make',
      '--platform',
      'linux',
      '--arch',
      'arm64',
      '--targets',
      '@electron-forge/maker-zip',
    ]);
    expect(command.environment).toEqual({ APP_VARIANT: 'release' });
    expect(command.cwd).toBe('/checkout');
    expect(shellCommand('/checkout').args.at(-1)).toBe('build:shell');
    expect(zipDirectory('/checkout', 'arm64')).toBe(
      '/checkout/apps/desktop/out/make/zip/linux/arm64',
    );
  });
});
