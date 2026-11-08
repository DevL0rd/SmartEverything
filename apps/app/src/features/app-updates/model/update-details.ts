import type { AndroidApkRelease, AppUpdateSummary } from '@smarteverything/domain';
import { releaseNotesOf, type ReleaseNotesView } from '../../../format/release-notes';
import { offerOf, type AppUpdateState } from './update-state';

interface AppReleaseDetails {
  readonly offerId: AppUpdateSummary['id'];
  readonly appVersion: string;
  readonly createdAt: string;
  readonly size: number;
  readonly notes: ReleaseNotesView | null;
}

interface OtaUpdateDetails extends AppReleaseDetails {
  readonly kind: 'ui-ota';
  readonly status: AppUpdateState['kind'];
}

interface AndroidApkDetails extends AppReleaseDetails {
  readonly kind: 'android-apk';
  readonly installerIdentity: string;
  readonly versionCode: AndroidApkRelease['build']['versionCode'];
}

function appReleaseDetailsOf(offer: AppUpdateSummary): AppReleaseDetails {
  return {
    offerId: offer.id,
    appVersion: offer.appVersion,
    createdAt: offer.createdAt,
    size: offer.size,
    notes: releaseNotesOf(offer.notes),
  };
}

export function otaUpdateDetailsOf(state: AppUpdateState): OtaUpdateDetails | null {
  const offer = offerOf(state);
  return offer === null
    ? null
    : { ...appReleaseDetailsOf(offer), kind: 'ui-ota', status: state.kind };
}

export function androidApkDetailsOf(release: AndroidApkRelease): AndroidApkDetails {
  return {
    ...appReleaseDetailsOf(release),
    kind: 'android-apk',
    installerIdentity: JSON.stringify([
      release.id,
      release.build.applicationId,
      release.build.versionCode,
      release.size,
      release.sha256,
    ]),
    versionCode: release.build.versionCode,
  };
}
