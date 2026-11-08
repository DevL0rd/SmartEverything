import {
  API_ENDPOINTS as E,
  type AndroidAppBuildReport,
  type AppUpdateChannel,
  type AppUpdateKeyReply,
  type AppUpdateOffer,
  type AppUpdateOutcome,
  type AppUpdatePlatform,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { noticeHandler } from '../../../store/notice-registry';
import { activeUpdateController } from './update-store';
import { installerNotice } from './installer-notice';
import { ANDROID_APK_OFFER_KEY } from './android-apk';
import { RELEASE_UPDATE_CHANNEL } from '../model/adapter';

export interface OfferRequest {
  readonly platform: AppUpdatePlatform;
  readonly channel: AppUpdateChannel;
  readonly runtimeVersion: string;
  readonly currentId: string | null;
}

export function readAppUpdateOffer(request: OfferRequest): Promise<AppUpdateOffer> {
  const { currentId, ...target } = request;
  return api().call(E.readAppUpdate, {
    query: currentId === null ? target : { ...target, currentId },
  });
}

export function readAppUpdateKey(): Promise<AppUpdateKeyReply> {
  return api().call(E.readAppUpdateKey, {});
}

export async function reportAndroidAppBuild(report: AndroidAppBuildReport): Promise<void> {
  await api().call(E.reportAndroidAppBuild, { body: report });
}

export async function reportAppUpdateOutcome(outcome: AppUpdateOutcome): Promise<void> {
  await api().call(E.reportAppUpdate, { body: outcome });
}

export const APP_UPDATE_NOTICES = noticeHandler(['app_update'], (message, { client }) => {
  activeUpdateController.get()?.receiveNotice(message);
  if (message.platform === 'desktop' && message.channel === RELEASE_UPDATE_CHANNEL)
    installerNotice.update((sequence) => sequence + 1);
  if (message.platform === 'android' && message.channel === RELEASE_UPDATE_CHANNEL) {
    const filter = { queryKey: ANDROID_APK_OFFER_KEY };
    background(
      client.cancelQueries(filter).then(() => client.invalidateQueries(filter)),
      'android_apk.offer_refresh_failed',
    );
  }
});
