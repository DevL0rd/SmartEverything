import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { bound, type RouteOf } from '../server/router';
import type { AndroidApkFolder } from './android-apk-folder';
import { offeredAndroidApk, pairedAndroid } from './android-apk-route';
import { androidUpdateHistory } from './android-update-history';
import type { AppUpdateFolder } from './update-folder';

export function androidUpdateHistoryRoute(
  ui: AppUpdateFolder,
  apk: AndroidApkFolder,
): RouteOf<'readAndroidUpdateHistory'> {
  return bound(E.readAndroidUpdateHistory, async ({ caller, query }) => {
    const clientId = pairedAndroid(caller);
    const [entries, scoped, shared] = await Promise.all([
      ui.entries(),
      apk.indexFor(query.channel, clientId),
      apk.indexFor(query.channel, null),
    ]);
    const installer = offeredAndroidApk(query, scoped.entries, shared.entries);
    if (installer !== null) await apk.downloadable(installer);
    return androidUpdateHistory(query, clientId, entries, {
      scoped: scoped.entries,
      shared: shared.entries,
    });
  });
}
