import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { UPDATE_DESKTOP_INPUT } from '@smarteverything/domain';
import { z } from 'zod';
import { loadRelease } from '../apps/hub/src/updates/release-folder.ts';
import { desktopWebRuntime } from '../apps/desktop/packaging/web-runtime.ts';
import { applyBuildHost, pnpmProgram, requireBuildHost } from './build-host.ts';
import { PublishOutputError, runCommand } from './publish-app-update-shared.ts';
import { webExportCommand, WEB_EXPORT } from './publish-app-update-desktop.ts';
import { publishLocalDesktop } from './release-machine-update.ts';
import { dataLayoutOf } from './release-hub-files.ts';
import { readReleaseVersion } from './release-version.ts';
import {
  readDesktopRelease,
  runDesktopRelease,
  type DesktopArch,
  type DesktopReleasePorts,
} from './self-update-desktop.ts';
import type { JobStore } from './self-update-job.ts';
import { syncedCheckout } from './self-update-checkout.ts';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import type { Command } from './release-android.ts';

const COMMAND = z.union([
  z.strictObject({ input: UPDATE_DESKTOP_INPUT, server: z.url({ protocol: /^https$/u }) }),
  z.strictObject({ runId: z.uuid() }),
]);
const now = (): Date => new Date();
const DESKTOP_PACKAGE = '@smarteverything/desktop';

export function shellCommand(root: string): Command {
  return {
    title: 'build the desktop shell',
    program: pnpmProgram(),
    args: ['--filter', DESKTOP_PACKAGE, 'run', 'build:shell'],
    cwd: root,
    environment: { APP_VARIANT: 'release' },
  };
}

export function driveMountCommand(root: string): Command {
  return {
    title: 'build the drive mount helper',
    program: pnpmProgram(),
    args: ['run', 'build:drive-mount'],
    cwd: root,
    environment: {},
  };
}

export function makeCommand(root: string, arch: DesktopArch): Command {
  return {
    title: `package the desktop app for linux ${arch}`,
    program: pnpmProgram(),
    args: [
      '--filter',
      DESKTOP_PACKAGE,
      'exec',
      'electron-forge',
      'make',
      '--platform',
      'linux',
      '--arch',
      arch,
      '--targets',
      '@electron-forge/maker-zip',
    ],
    cwd: root,
    environment: { APP_VARIANT: 'release' },
  };
}

export function zipDirectory(root: string, arch: DesktopArch): string {
  return join(root, 'apps', 'desktop', 'out', 'make', 'zip', 'linux', arch);
}

async function builtZip(root: string, arch: DesktopArch): Promise<string> {
  const directory = zipDirectory(root, arch);
  await rm(directory, { recursive: true, force: true });
  runCommand(makeCommand(root, arch));
  const zips = (await readdir(directory)).filter((file) => file.endsWith('.zip'));
  const [name] = zips;
  if (name === undefined || zips.length !== 1)
    throw new PublishOutputError(`the linux ${arch} package`, 'expected exactly one ZIP');
  return join(directory, name);
}

async function prepared(root: string, server: string): Promise<string> {
  runCommand(webExportCommand(server));
  if ((await stat(join(WEB_EXPORT, 'index.html'))).size === 0)
    throw new PublishOutputError('desktop web export', 'expected a nonempty index.html');
  runCommand(shellCommand(root));
  runCommand(driveMountCommand(root));
  return desktopWebRuntime(join(root, 'apps', 'desktop'));
}

function storeOf(layout: HubLayout, runId: string): JobStore {
  return { folder: join(layout.system.updates.selfUpdate, 'jobs'), now, newId: () => runId };
}

function portsOf(
  layout: HubLayout,
  root: string,
  server: string,
  runId: string,
): DesktopReleasePorts {
  return {
    store: storeOf(layout, runId),
    sync: async (): Promise<string> => {
      requireBuildHost(layout, root, 'desktop');
      return syncedCheckout(layout, root);
    },
    version: () => readReleaseVersion('desktop', root),
    current: () => loadRelease(layout.system.updates.machineUpdates),
    prepare: () => prepared(root, server),
    build: (arch) => builtZip(root, arch),
    publish: (version, files, metadata) => publishLocalDesktop(layout, version, files, metadata),
  };
}

async function main(): Promise<void> {
  const data = z.string().refine(isAbsolute).parse(process.argv[2]);
  const command = COMMAND.parse(JSON.parse(z.string().parse(process.argv[3])));
  const layout = dataLayoutOf(data);
  await mkdir(join(layout.system.updates.selfUpdate, 'jobs'), { recursive: true, mode: 0o700 });
  if ('runId' in command) {
    const desktop = readDesktopRelease(command.runId, storeOf(layout, command.runId));
    process.stdout.write(`${JSON.stringify({ desktop })}\n`);
    return;
  }
  const root = process.cwd();
  applyBuildHost(layout, root);
  const ports = portsOf(layout, root, command.server, command.input.runId);
  const result = await runDesktopRelease(command.input, ports);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.main) await main();
