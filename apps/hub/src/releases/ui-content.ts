import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import { APP_UPDATE_FILE_PATH, ApiError } from '@smarteverything/domain';
import { z } from 'zod';
import { verifyHermesBundle } from '../app-updates/hermes-bundle';
import { ASSET_TYPES } from './asset-types';
import { listedFile, readListed, refuse, type StagedRelease } from './staged-release';

const ENTRY_FILE = 'index.html';

const BUNDLE_FILE = 'bundle.json';

const METADATA_FILE = 'metadata.json';

const EXPO_CLIENT_FILE = 'expo-client.json';

const DOM_ASSET_PREFIX = 'www.bundle/';

const BUNDLE_TYPE = 'application/javascript';

const METADATA = z.looseObject({
  fileMetadata: z.looseObject({
    android: z.looseObject({
      bundle: APP_UPDATE_FILE_PATH,
      assets: z.array(z.looseObject({ path: APP_UPDATE_FILE_PATH, ext: z.string() })),
    }),
  }),
});

const EXPO_CLIENT = z.record(z.string(), z.json());

const ANDROID_PACKAGE = z.looseObject({
  android: z.looseObject({ package: z.string().min(1) }),
});

export interface PreparedFile {
  readonly path: string;
  readonly tree: string;
  readonly contentType: string;
  readonly fileExtension?: string;
}

export interface PreparedUpdate {
  readonly launch: PreparedFile | null;
  readonly files: readonly PreparedFile[];
  readonly expoClient: Readonly<Record<string, unknown>> | null;
}

function contentTypeOf(path: string, extension: string = extname(path)): string {
  const contentType = ASSET_TYPES[extension.toLowerCase()];
  if (contentType === undefined)
    refuse('bad_layout', `${path} has the extension "${extension}", which has no content type.`);
  return contentType;
}

function bundleOf(path: string): PreparedFile {
  return {
    path,
    tree: path,
    contentType: BUNDLE_TYPE,
    fileExtension: extname(path),
  };
}

function assetOf(asset: { path: string; ext: string }): PreparedFile {
  const extension = asset.ext === '' ? '' : `.${asset.ext}`;
  const path =
    extension !== '' && extname(asset.path) === extension
      ? asset.path.slice(0, -extension.length)
      : asset.path;
  return {
    path,
    tree: asset.path,
    contentType: contentTypeOf(asset.path, extension),
    ...(extension === '' ? {} : { fileExtension: extension }),
  };
}

function jsonOf(path: string, bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (cause) {
    return refuse(
      'bad_layout',
      `${path} is not JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

async function verifyDomAsset(stage: StagedRelease, path: string, bundle: Buffer): Promise<void> {
  const html = await readListed(stage, path);
  const expected = `${createHash('md5').update(html).digest('hex')}.html`;
  if (basename(path) !== expected || !bundle.includes(expected))
    refuse('bad_layout', `${path} must match its content hash and the bundle reference.`);
}

export async function androidContent(stage: StagedRelease): Promise<PreparedUpdate> {
  const parsed = METADATA.safeParse(jsonOf(METADATA_FILE, await readListed(stage, METADATA_FILE)));
  if (!parsed.success) refuse('bad_layout', `${METADATA_FILE}: ${parsed.error.message}`);
  const { bundle, assets } = parsed.data.fileMetadata.android;
  const bytes = await readListed(stage, bundle);
  try {
    verifyHermesBundle(bundle, bytes);
  } catch (cause) {
    if (cause instanceof ApiError) refuse('bad_layout', cause.message);
    throw cause;
  }
  for (const asset of assets) {
    if (!asset.path.startsWith(DOM_ASSET_PREFIX)) continue;
    const html = extname(asset.path) === '.html';
    if (html !== (asset.ext === 'html'))
      refuse('bad_layout', `${asset.path} must have an .html path and extension.`);
    if (html) await verifyDomAsset(stage, asset.path, bytes);
  }
  const client = EXPO_CLIENT.safeParse(
    jsonOf(EXPO_CLIENT_FILE, await readListed(stage, EXPO_CLIENT_FILE)),
  );
  if (!client.success || !ANDROID_PACKAGE.safeParse(client.data).success)
    refuse('bad_layout', `${EXPO_CLIENT_FILE} must name the Android package in android.package.`);
  return {
    launch: bundleOf(bundle),
    files: assets.map(assetOf),
    expoClient: client.data,
  };
}

export async function desktopContent(stage: StagedRelease): Promise<PreparedUpdate> {
  const paths = stage.manifest.files.map((file) => file.path).sort();
  if (!paths.includes(ENTRY_FILE) || listedFile(stage, ENTRY_FILE).size === 0)
    refuse('bad_layout', `The web export needs a nonempty ${ENTRY_FILE}.`);
  if (paths.includes(BUNDLE_FILE))
    refuse('bad_layout', `${BUNDLE_FILE} is reserved by the desktop updater.`);
  for (const path of paths) await readListed(stage, path);
  return {
    launch: null,
    files: paths.map((path) => ({
      path,
      tree: path,
      contentType: contentTypeOf(path),
    })),
    expoClient: null,
  };
}

export function androidPackage(expoClient: Readonly<Record<string, unknown>>): string {
  return ANDROID_PACKAGE.parse(expoClient).android.package;
}
