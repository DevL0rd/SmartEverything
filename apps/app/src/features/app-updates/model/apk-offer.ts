import type { AndroidApkRelease, NativeAndroidUpdateStage } from '@smarteverything/domain';
import {
  OFFER_TITLE,
  QUIET_OFFER,
  offerAction,
  releaseCopy,
  type ReleaseOffer,
} from './release-offer';

export type InstallerStage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'permission' | 'preparing' }
  | {
      readonly kind: NativeAndroidUpdateStage;
      readonly progress: number;
      readonly url: string;
    }
  | { readonly kind: 'failed'; readonly reason: string };

type Shown = Pick<ReleaseOffer, 'tone' | 'title'> & Partial<ReleaseOffer>;

function shownOf(stage: InstallerStage): Shown {
  switch (stage.kind) {
    case 'idle':
      return {
        tone: 'info',
        title: OFFER_TITLE.available,
        action: offerAction('update'),
        dismissible: true,
      };
    case 'permission':
      return {
        tone: 'info',
        title: OFFER_TITLE.permission,
        sentence: 'Allow installs from SmartEverything in Android settings to continue.',
      };
    case 'preparing':
      return { tone: 'info', title: OFFER_TITLE.downloading, progress: 0 };
    case 'downloading':
      return {
        tone: 'info',
        title: OFFER_TITLE.downloading,
        progress: stage.progress,
        action: offerAction('cancel'),
      };
    case 'verifying':
      return {
        tone: 'info',
        title: OFFER_TITLE.verifying,
        progress: stage.progress,
        action: offerAction('cancel'),
      };
    case 'waiting_for_android':
      return {
        tone: 'info',
        title: OFFER_TITLE.android,
        sentence: 'Confirm the update in Android’s prompt. SmartEverything opens again by itself.',
      };
    case 'failed':
      return {
        tone: 'critical',
        title: OFFER_TITLE.installFailed,
        sentence: stage.reason,
        action: offerAction('retry'),
        dismissible: true,
      };
  }
}

export function apkOfferOf(release: AndroidApkRelease, stage: InstallerStage): ReleaseOffer {
  return {
    ...QUIET_OFFER,
    key: `apk:${stage.kind}:${release.id}`,
    offerId: release.id,
    ...releaseCopy(release),
    ...shownOf(stage),
  };
}
