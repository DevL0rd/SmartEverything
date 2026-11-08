import {
  ANDROID_APK_CONTENT_TYPE,
  ANDROID_APK_RELEASE,
  ANDROID_APK_SCOPE,
  API_ENDPOINTS as E,
  ApiError,
  MEDIA_PATHS,
  type AndroidApkRelease,
  type AndroidAppBuild,
} from '@smarteverything/domain';
import { createReadStream } from 'node:fs';
import { directClient, type Caller } from '../server/auth';
import type { RawRoute } from '../server/http-server';
import type { MediaLinks } from '../server/media-links';
import { serveBytes } from '../server/file-serve';
import { bound, type RouteOf } from '../server/router';
import { newestAndroidApk, type AndroidApkFolder } from './android-apk-folder';

export function pairedAndroid(caller: Caller): string {
  const client = directClient(caller);
  if (client?.platform !== 'android') {
    throw new ApiError('forbidden', 'Only a paired Android app can get its installer.');
  }
  return client.id;
}

export function offeredAndroidApk(
  build: AndroidAppBuild,
  scoped: readonly AndroidApkRelease[],
  shared: readonly AndroidApkRelease[],
): AndroidApkRelease | null {
  const release = newestAndroidApk(scoped, shared);
  return release?.build.applicationId === build.applicationId &&
    Number(release.build.versionCode) > Number(build.versionCode)
    ? release
    : null;
}

export function androidApkOffer(
  links: MediaLinks,
  folder: AndroidApkFolder,
): RouteOf<'readAndroidApkOffer'> {
  return bound(E.readAndroidApkOffer, async ({ caller, query }) => {
    const clientId = pairedAndroid(caller);
    const [shared, scoped] = await Promise.all([
      folder.indexFor(query.channel, null),
      folder.indexFor(query.channel, clientId),
    ]);
    const release = offeredAndroidApk(query, scoped.entries, shared.entries);
    if (release === null) return null;
    await folder.downloadable(release);
    return {
      release,
      download: links.androidApk(release.channel, release.clientId ?? 'shared', release.id),
    };
  });
}

export function androidApkDownload(links: MediaLinks, folder: AndroidApkFolder): RawRoute {
  return {
    method: 'GET',
    path: MEDIA_PATHS.androidApk,
    handle: async (request, response, params): Promise<void> => {
      links.verify(new URL(request.url ?? '/', 'http://hub'));
      const channel = ANDROID_APK_RELEASE.shape.channel.safeParse(params['channel']);
      const scope = ANDROID_APK_SCOPE.safeParse(params['scope']);
      if (!channel.success || !scope.success)
        throw new ApiError('not_found', 'This Android installer is no longer available.');
      const release = await folder.releaseFor(
        channel.data,
        scope.data === 'shared' ? null : scope.data,
      );
      if (release === null || release.id !== params['id'])
        throw new ApiError('not_found', 'This Android installer is no longer available.');
      const file = await folder.downloadable(release);
      await serveBytes(
        {
          size: release.size,
          headers: {
            'content-type': ANDROID_APK_CONTENT_TYPE,
            'content-disposition': `attachment; filename="SmartEverything-${release.build.versionCode}.apk"`,
            'cache-control': 'private, no-store',
          },
          stream: (range) =>
            createReadStream(
              file,
              range === undefined ? {} : { start: range.start, end: range.end },
            ),
        },
        request,
        response,
      );
    },
  };
}
