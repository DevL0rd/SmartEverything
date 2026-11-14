import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { APP_UPDATE_FILE_PATH, type AppUpdateEntry } from '@smarteverything/domain';
import { z } from 'zod';
import { pnpmProgram } from './build-host.ts';
import type { SourceFile } from './app-update-store.ts';
import {
  PublishOutputError,
  contentTypeOf,
  jsonOf,
  publishPrepared,
  type Dependencies,
  type PreparedUpdate,
  type PublishRequest,
} from './publish-app-update-shared.ts';
import {
  buildEnvironment,
  licenceCommand,
  type EnvironmentOptions,
  type Command,
} from './release-android.ts';

const ROOT = join(import.meta.dirname, '..');
const APP = join(ROOT, 'apps', 'app');

export const ANDROID_EXPORT = join(ROOT, 'tmp', 'ota', 'export-android');

const BUNDLE_TYPE = 'application/javascript';
const HERMES_MAGIC = Buffer.from('c61fbc03c103191f', 'hex');
const HERMES_LENGTH_OFFSET = 32;
const HERMES_FOOTER_BYTES = 20;
const DOM_ASSET_PREFIX = 'www.bundle/';

const METADATA = z.looseObject({
  fileMetadata: z.looseObject({
    android: z.looseObject({
      bundle: APP_UPDATE_FILE_PATH,
      assets: z.array(z.looseObject({ path: APP_UPDATE_FILE_PATH, ext: z.string() })),
    }),
  }),
});

const RUNTIME_OUTPUT = z.looseObject({ runtimeVersion: z.string().min(1) });

const EXPO_CLIENT = z.record(z.string(), z.json());

export function releaseOptions(server: string): EnvironmentOptions {
  return { variant: 'release', server };
}

function inApp(title: string, args: readonly string[], server: string): Command {
  return {
    title,
    program: pnpmProgram(),
    args: ['exec', ...args],
    cwd: APP,
    environment: buildEnvironment(releaseOptions(server)),
  };
}

export function exportCommand(server: string, exportDirectory: string): Command {
  return inApp(
    'export the Android bundle',
    ['expo', 'export', '--platform', 'android', '--output-dir', exportDirectory, '--clear'],
    server,
  );
}

export function runtimeCommand(server: string): Command {
  return {
    ...inApp(
      'resolve the Android runtime version',
      ['expo-updates', 'runtimeversion:resolve', '--platform', 'android'],
      server,
    ),
    captureOutput: true,
  };
}

export function configCommand(server: string): Command {
  return {
    ...inApp(
      'read the public Expo config',
      ['expo', 'config', '--type', 'public', '--json'],
      server,
    ),
    captureOutput: true,
  };
}

export function parseRuntime(text: string): string {
  const parsed = RUNTIME_OUTPUT.safeParse(jsonOf('expo-updates runtimeversion:resolve', text));
  if (!parsed.success) throw new PublishOutputError('expo-updates', parsed.error.message);
  return parsed.data.runtimeVersion;
}

export function parseExpoClient(text: string): z.infer<typeof EXPO_CLIENT> {
  const parsed = EXPO_CLIENT.safeParse(jsonOf('expo config', text));
  if (!parsed.success) throw new PublishOutputError('expo config', parsed.error.message);
  return parsed.data;
}

export async function readMetadata(exportDirectory: string): Promise<{
  readonly bundle: string;
  readonly assets: readonly { readonly path: string; readonly ext: string }[];
}> {
  const file = join(exportDirectory, 'metadata.json');
  const parsed = METADATA.safeParse(jsonOf(file, await readFile(file, 'utf8')));
  if (!parsed.success) throw new PublishOutputError(file, parsed.error.message);
  return parsed.data.fileMetadata.android;
}

function verifyHermesBundle(path: string, bundle: Buffer): void {
  const footerOffset = bundle.length - HERMES_FOOTER_BYTES;
  if (
    footerOffset < HERMES_LENGTH_OFFSET + 4 ||
    !bundle.subarray(0, HERMES_MAGIC.length).equals(HERMES_MAGIC) ||
    bundle.readUInt32LE(HERMES_LENGTH_OFFSET) !== bundle.length
  ) {
    throw new PublishOutputError(path, 'Expected an Android Hermes bytecode bundle');
  }
  const digest = createHash('sha1').update(bundle.subarray(0, footerOffset)).digest();
  if (!digest.equals(bundle.subarray(footerOffset))) {
    throw new PublishOutputError(path, 'Hermes bytecode changed after compilation');
  }
  if (!bundle.includes('SHA-256')) {
    throw new PublishOutputError(path, 'The bundle is missing the native SHA-256 algorithm name');
  }
}

async function verifyDomAsset(root: string, path: string, bundle: Buffer): Promise<void> {
  const html = await readFile(join(root, path));
  const expected = createHash('md5').update(html).digest('hex') + '.html';
  if (basename(path) !== expected || !bundle.includes(expected)) {
    throw new PublishOutputError(
      path,
      'The DOM page must match its content hash and bundle reference',
    );
  }
}

function assetSource(exportDirectory: string, asset: { path: string; ext: string }): SourceFile {
  const extension = asset.ext === '' ? '' : `.${asset.ext}`;
  const path =
    extension !== '' && extname(asset.path) === extension
      ? asset.path.slice(0, -extension.length)
      : asset.path;
  return {
    source: join(exportDirectory, asset.path),
    path,
    contentType: contentTypeOf(asset.path, extension),
    ...(extension === '' ? {} : { fileExtension: extension }),
  };
}

function bundleSource(exportDirectory: string, bundle: string): SourceFile {
  return {
    source: join(exportDirectory, bundle),
    path: bundle,
    contentType: BUNDLE_TYPE,
    fileExtension: extname(bundle),
  };
}

export interface AndroidSources {
  readonly launch: SourceFile;
  readonly files: readonly SourceFile[];
}

export async function androidSources(exportDirectory: string): Promise<AndroidSources> {
  const metadata = await readMetadata(exportDirectory);
  const launch = bundleSource(exportDirectory, metadata.bundle);
  const bundle = await readFile(launch.source);
  verifyHermesBundle(launch.path, bundle);
  for (const asset of metadata.assets) {
    if (!asset.path.startsWith(DOM_ASSET_PREFIX)) continue;
    const htmlPath = extname(asset.path) === '.html';
    if (htmlPath !== (asset.ext === 'html')) {
      throw new PublishOutputError(
        asset.path,
        'The DOM page must have an .html path and extension',
      );
    }
    if (htmlPath) await verifyDomAsset(exportDirectory, asset.path, bundle);
  }
  return { launch, files: metadata.assets.map((asset) => assetSource(exportDirectory, asset)) };
}

function launchOnlySources(launchFile: string): AndroidSources {
  return {
    launch: {
      source: launchFile,
      path: basename(launchFile),
      contentType: BUNDLE_TYPE,
      fileExtension: extname(launchFile),
    },
    files: [],
  };
}

export async function prepareAndroid(
  request: Pick<PublishRequest, 'server' | 'channel' | 'launchFile'>,
  dependencies: Dependencies,
): Promise<PreparedUpdate> {
  const { run, exportDirectory } = dependencies;
  if (
    request.launchFile !== undefined &&
    (request.channel !== 'dev' || extname(request.launchFile) !== '.js')
  ) {
    throw new PublishOutputError(
      '--launch-file',
      'Only .js crash fixtures on the dev channel are supported',
    );
  }
  if (request.launchFile === undefined) {
    run(licenceCommand());
    run(exportCommand(request.server, exportDirectory));
  }
  const runtimeVersion = parseRuntime(run(runtimeCommand(request.server)));
  const expoClient = parseExpoClient(run(configCommand(request.server)));
  const { launch, files } =
    request.launchFile === undefined
      ? await androidSources(exportDirectory)
      : launchOnlySources(request.launchFile);
  return { platform: 'android', runtimeVersion, launch, files, expoClient };
}

export function publishAndroid(
  request: PublishRequest,
  dependencies: Dependencies,
): Promise<AppUpdateEntry> {
  return publishPrepared(request, () => prepareAndroid(request, dependencies));
}
