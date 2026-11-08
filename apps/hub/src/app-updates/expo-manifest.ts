import {
  latestAppUpdate,
  rollsBackToEmbedded,
  type AppUpdateEntry,
  type AppUpdateFile,
  type AppUpdateTarget,
  type JsonValue,
} from '@smarteverything/domain';
import type { ExpoRequest } from './expo-request';

export type AndroidAppUpdateEntry = Extract<AppUpdateEntry, { readonly platform: 'android' }>;

export type ExpoAnswer =
  | { readonly kind: 'manifest'; readonly entry: AndroidAppUpdateEntry }
  | { readonly kind: 'noUpdateAvailable' }
  | { readonly kind: 'rollBackToEmbedded'; readonly commitTime: string };

export interface ExpoAsset {
  readonly hash: string;
  readonly key: string;
  readonly contentType: string;
  readonly fileExtension?: string;
  readonly url: string;
}

export interface ExpoManifest {
  readonly id: string;
  readonly createdAt: string;
  readonly runtimeVersion: string;
  readonly launchAsset: ExpoAsset;
  readonly assets: readonly ExpoAsset[];
  readonly metadata: Readonly<Record<string, never>>;
  readonly extra: {
    readonly expoClient: Readonly<Record<string, JsonValue>>;
    readonly smarteverything: { readonly appVersion: string; readonly notes: string };
  };
}

export type ExpoDirective =
  | { readonly type: 'noUpdateAvailable' }
  | { readonly type: 'rollBackToEmbedded'; readonly parameters: { readonly commitTime: string } };

export type AssetLink = (sha256: string) => string;

function isAndroid(entry: AppUpdateEntry): entry is AndroidAppUpdateEntry {
  return entry.platform === 'android';
}

function moment(value: string): string {
  return new Date(value).toISOString();
}

function commitTimeOf(
  entries: readonly AppUpdateEntry[],
  target: AppUpdateTarget,
  currentId: string | null,
  clientId: string | undefined,
): string | null {
  if (!rollsBackToEmbedded(entries, { ...target, clientId }, currentId)) return null;
  const at = entries.find((entry) => entry.id === currentId)?.withdrawn?.at;
  return at === undefined ? null : moment(at);
}

export function expoAnswerFor(
  entries: readonly AppUpdateEntry[],
  request: ExpoRequest,
  clientId?: string,
): ExpoAnswer {
  const target: AppUpdateTarget = {
    platform: 'android',
    channel: request.channel,
    runtimeVersion: request.runtimeVersion,
  };
  const latest = latestAppUpdate(entries.filter(isAndroid), { ...target, clientId });
  if (request.download !== null && latest?.id !== request.download) {
    return { kind: 'noUpdateAvailable' };
  }
  const commitTime = commitTimeOf(entries, target, request.currentUpdateId, clientId);
  if (commitTime !== null) return { kind: 'rollBackToEmbedded', commitTime };
  if (latest === null || latest.id === request.currentUpdateId) {
    return { kind: 'noUpdateAvailable' };
  }
  return { kind: 'manifest', entry: latest };
}

function assetOf(file: AppUpdateFile, origin: string, link: AssetLink): ExpoAsset {
  return {
    hash: Buffer.from(file.sha256, 'hex').toString('base64url'),
    key: file.path.slice(file.path.lastIndexOf('/') + 1),
    contentType: file.contentType,
    ...(file.fileExtension === undefined ? {} : { fileExtension: file.fileExtension }),
    url: new URL(link(file.sha256), origin).href,
  };
}

export function expoManifestFor(
  entry: AndroidAppUpdateEntry,
  origin: string,
  link: AssetLink,
): ExpoManifest {
  return {
    id: entry.id,
    createdAt: moment(entry.createdAt),
    runtimeVersion: entry.runtimeVersion,
    launchAsset: assetOf(entry.launch, origin, link),
    assets: entry.files.map((file) => assetOf(file, origin, link)),
    metadata: {},
    extra: {
      expoClient: entry.expoClient,
      smarteverything: { appVersion: entry.appVersion, notes: entry.notes },
    },
  };
}

export function expoDirectiveFor(answer: Exclude<ExpoAnswer, { kind: 'manifest' }>): ExpoDirective {
  return answer.kind === 'noUpdateAvailable'
    ? { type: 'noUpdateAvailable' }
    : { type: 'rollBackToEmbedded', parameters: { commitTime: answer.commitTime } };
}
