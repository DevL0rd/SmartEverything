import { spawnSync } from 'node:child_process';
import { extname } from 'node:path';
import {
  APP_UPDATE_PUBLICATION,
  type AppUpdateChannel,
  type AppUpdateEntry,
  type AppUpdatePlatform,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { publishUpdate, uploadBlob, type SourceFile } from './app-update-store.ts';
import type { PublisherTarget } from './machine-update-client.ts';
import type { Command } from './release-android.ts';
import { capturedText, releaseCommandEnvironment } from './release-process.ts';
import { readReleaseVersion } from './release-version.ts';

const log = new Logger('tool.publish-app-update');

export class PublishCommandError extends Error {
  override readonly name = 'PublishCommandError';

  constructor(
    readonly title: string,
    readonly status: number | null,
  ) {
    super(`${title} failed with exit code ${String(status)}`);
  }
}

export class PublishOutputError extends Error {
  override readonly name = 'PublishOutputError';

  constructor(
    readonly source: string,
    reason: string,
  ) {
    super(`The output of ${source} cannot be used: ${reason}`);
  }
}

export class AssetTypeError extends Error {
  override readonly name = 'AssetTypeError';

  constructor(
    readonly path: string,
    readonly extension: string,
  ) {
    super(
      `The asset ${path} has the extension "${extension}", which has no content type in ASSET_TYPES of tooling/publish-app-update-shared.ts`,
    );
  }
}

export type CommandRunner = (command: Command) => string;

export interface Dependencies {
  readonly run: CommandRunner;
  readonly exportDirectory: string;
  readonly webDirectory: string;
  readonly desktopRuntime: () => Promise<string>;
}

export function runCommand(command: Command): string {
  process.stderr.write(`${command.title}\n`);
  const result = spawnSync(command.program, [...command.args], {
    cwd: command.cwd,
    stdio: ['ignore', command.captureOutput === true ? 'pipe' : 2, 'inherit'],
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    env: releaseCommandEnvironment(command.environment),
  });
  if (result.status !== 0) throw new PublishCommandError(command.title, result.status);
  return command.captureOutput === true ? capturedText(result.stdout) : '';
}

const ASSET_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.pem': 'application/x-pem-file',
};

export function contentTypeOf(path: string, extension: string = extname(path)): string {
  const contentType = ASSET_TYPES[extension.toLowerCase()];
  if (contentType === undefined) throw new AssetTypeError(path, extension);
  return contentType;
}

export function jsonOf(source: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new PublishOutputError(source, error instanceof Error ? error.message : 'not JSON');
  }
}

export interface PublishRequest {
  readonly target: PublisherTarget;
  readonly server: string;
  readonly channel: AppUpdateChannel;
  readonly notes: string;
  readonly launchFile?: string | undefined;
}

export interface PreparedUpdate {
  readonly platform: AppUpdatePlatform;
  readonly runtimeVersion: string;
  readonly launch: SourceFile | null;
  readonly files: readonly SourceFile[];
  readonly expoClient: AppUpdateEntry['expoClient'];
}

export async function publishPrepared(
  request: PublishRequest,
  prepare: () => Promise<PreparedUpdate>,
): Promise<AppUpdateEntry> {
  const content = await prepare();
  const launch = content.launch === null ? null : await uploadBlob(request.target, content.launch);
  const files = [];
  for (const file of content.files) files.push(await uploadBlob(request.target, file));
  const entry = await publishUpdate(
    request.target,
    APP_UPDATE_PUBLICATION.parse({
      platform: content.platform,
      channel: request.channel,
      runtimeVersion: content.runtimeVersion,
      appVersion: readReleaseVersion(content.platform === 'android' ? 'app' : 'desktop'),
      notes: request.notes,
      launch,
      files,
      expoClient: content.expoClient,
    }),
  );
  log.info('app_update.published', {
    id: entry.id,
    platform: entry.platform,
    channel: entry.channel,
    runtimeVersion: entry.runtimeVersion,
    files: entry.files.length,
  });
  return entry;
}
