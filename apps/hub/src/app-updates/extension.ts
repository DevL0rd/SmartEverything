import {
  API_ENDPOINTS as E,
  ApiError,
  MEDIA_PATHS,
  type AppUpdateOutcome,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { createReadStream } from 'node:fs';
import type { ExtensionContext, RunningExtension, ServerExtension } from '../extensions';
import type { RawRoute } from '../server/http-server';
import type { MediaLinks } from '../server/media-links';
import { directClient, type Caller } from '../server/auth';
import { serveBytes } from '../server/file-serve';
import { DONE_REPLY, bound, type ExtensionRouteTable } from '../server/router';
import { AndroidApkFolder } from './android-apk-folder';
import { androidApkDownload, androidApkOffer } from './android-apk-route';
import { watchAndroidApks } from './android-apk-watch';
import { AndroidBuilds } from './android-builds';
import { androidUpdateHistoryRoute } from './android-update-history-route';
import { AppUpdates, updateAudience } from './app-updates';
import {
  AppUpdatePublisher,
  appUpdatePublicationEndpoints,
  appUpdateUploadRoute,
} from './publication';
import { expoManifestRoute } from './expo-manifest-route';
import { ManifestSigner } from './manifest-signing';
import { AppUpdateFolder } from './update-folder';
import { appUpdateKeyOf } from './update-key';
import { AppUpdateWatch } from './update-watch';

const IMMUTABLE = 'private, max-age=31536000, immutable';

export function appUpdateBlobRoute(links: MediaLinks, folder: AppUpdateFolder): RawRoute {
  return {
    method: 'GET',
    path: MEDIA_PATHS.appUpdateBlob,
    handle: async (request, response, params): Promise<void> => {
      links.verify(new URL(request.url ?? '/', 'http://hub'));
      const sha256 = params['sha256'];
      if (sha256 === undefined)
        throw new ApiError('invalid_request', 'The update file is missing.');
      const blob = await folder.blobFor(sha256);
      await serveBytes(
        {
          size: blob.size,
          headers: { 'content-type': blob.contentType, 'cache-control': IMMUTABLE },
          stream: (range) =>
            createReadStream(
              blob.path,
              range === undefined ? {} : { start: range.start, end: range.end },
            ),
        },
        request,
        response,
      );
    },
  };
}

interface OutcomeReport {
  readonly updates: AppUpdates;
  readonly builds: AndroidBuilds;
  readonly caller: Caller;
  readonly outcome: AppUpdateOutcome;
  readonly at: Date;
}

function reportOutcome({ updates, builds, caller, outcome, at }: OutcomeReport): void {
  const client = directClient(caller);
  if (client === undefined) {
    throw new ApiError('forbidden', 'Only a paired device can report its own update.');
  }
  updates.report(client, outcome);
  builds.recordOutcome(client, outcome, at);
}

interface Endpoints {
  readonly context: ExtensionContext;
  readonly folder: AppUpdateFolder;
  readonly apkFolder: AndroidApkFolder;
  readonly updates: AppUpdates;
  readonly builds: AndroidBuilds;
  readonly publisher: AppUpdatePublisher;
}

function appUpdateEndpoints(parts: Endpoints): ExtensionRouteTable {
  const { context, folder, apkFolder, updates, builds, publisher } = parts;
  return {
    readAndroidApkOffer: androidApkOffer(context.links, apkFolder),
    readAndroidUpdateHistory: androidUpdateHistoryRoute(folder, apkFolder),
    readAppUpdate: bound(E.readAppUpdate, ({ query, caller }) =>
      updates.offer(query, updateAudience(caller)),
    ),
    listAppUpdates: bound(E.listAppUpdates, () => updates.list()),
    ...appUpdatePublicationEndpoints(publisher),
    readAppUpdateKey: bound(E.readAppUpdateKey, ({ caller }) =>
      appUpdateKeyOf(context.store, caller),
    ),
    readAndroidAppBuild: bound(E.readAndroidAppBuild, ({ params }) => {
      const client = context.store.clients.find(params.clientId);
      return client === undefined ? null : builds.read(client);
    }),
    readAndroidAppBuilds: bound(E.readAndroidAppBuilds, () => [
      ...builds.paired(context.store.clients.list()),
    ]),
    reportAndroidAppBuild: bound(E.reportAndroidAppBuild, ({ body, caller }) => {
      builds.report(caller, body, context.store.now());
      return DONE_REPLY;
    }),
    reportAppUpdate: bound(E.reportAppUpdate, ({ body, caller }) => {
      reportOutcome({ updates, builds, caller, outcome: body, at: context.store.now() });
      return DONE_REPLY;
    }),
  };
}

export function appUpdatesExtension(): ServerExtension {
  return async (context): Promise<RunningExtension> => {
    const log = new Logger('hub.app-updates');
    const folder = new AppUpdateFolder(context.layout);
    const apkFolder = new AndroidApkFolder(context.layout);
    const updates = new AppUpdates(folder, context.links, log);
    const publisher = new AppUpdatePublisher(
      context.layout,
      folder,
      () => context.store.now(),
      log,
    );
    const builds = new AndroidBuilds(context.store.androidBuildObservations);
    const watch = new AppUpdateWatch(folder, context.live, log);
    await watch.start();
    const signer = await ManifestSigner.start(folder.directory, log);
    const stopApkWatch = await watchAndroidApks(apkFolder, context.live, log);
    return {
      endpoints: appUpdateEndpoints({ context, folder, apkFolder, updates, builds, publisher }),
      routes: [
        androidApkDownload(context.links, apkFolder),
        appUpdateBlobRoute(context.links, folder),
        appUpdateUploadRoute(context.store, publisher),
        expoManifestRoute({ store: context.store, links: context.links, folder, signer, log }),
      ],
      stop: async (): Promise<void> => {
        await Promise.all([watch.stop(), stopApkWatch()]);
      },
    };
  };
}
