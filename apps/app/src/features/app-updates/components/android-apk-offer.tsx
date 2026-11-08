import { useRef, useState, type ReactNode, type RefObject } from 'react';
import type { AndroidApkRelease } from '@smarteverything/domain';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { anchorKey } from '../../../components/highlight-keys';
import { useHighlightAnchor } from '../../../components/use-highlight-anchor';
import { useUpdateDetails, type UpdateDetailsOffer } from '../../../components/use-update-details';
import { bytes } from '../../../format/number';
import { shortDate } from '../../../format/time';
import {
  useAndroidApkInstall,
  useAndroidApkOffer,
  type AndroidApkInstall,
} from '../data/android-apk';
import { apkOfferOf } from '../model/apk-offer';
import type { ReleaseOffer } from '../model/release-offer';
import { androidApkDetailsOf } from '../model/update-details';
import { ANDROID_INSTALLER_SETTING } from '../settings';
import { AndroidUpdateHistory } from './android-update-history';
import { OfferBlock, OfferButton } from './offer-block';
import { OfferNotice, offerButton, offerDetailsFooter, useShellScope } from './offer-notice';

function apkPress(offer: ReleaseOffer, install: AndroidApkInstall): (() => void) | undefined {
  const kind = offer.action?.kind;
  if (kind === 'cancel') return install.cancel;
  return kind === 'update' || kind === 'retry' ? install.install : undefined;
}

function apkDetailsOf(
  release: AndroidApkRelease,
  offer: ReleaseOffer,
  press: (() => void) | undefined,
  scope: unknown,
): UpdateDetailsOffer {
  const data = androidApkDetailsOf(release);
  return {
    id: data.installerIdentity,
    scope,
    content: {
      title: `SmartEverything ${data.appVersion}`,
      target: 'Android app',
      metadata: [shortDate(data.createdAt), bytes(data.size)],
      notes: data.notes?.full,
    },
    releaseNotesContent: (
      <AndroidUpdateHistory offerKind="apk" offerId={data.offerId} notes={data.notes?.full} />
    ),
    footer: offerDetailsFooter(
      offer,
      press === undefined
        ? undefined
        : (): void => {
            press();
          },
    ),
  };
}

function useApkOffer(
  release: AndroidApkRelease | null,
  opener: RefObject<View | null> | undefined,
  suspended: boolean,
): {
  readonly offer: ReleaseOffer | null;
  readonly press: (() => void) | undefined;
  readonly details: ReturnType<typeof useUpdateDetails>;
} {
  const install = useAndroidApkInstall(release);
  const scope = useShellScope();
  const offer = release === null ? null : apkOfferOf(release, install.stage);
  const press = offer === null ? undefined : apkPress(offer, install);
  const details = useUpdateDetails(
    release === null || offer === null ? null : apkDetailsOf(release, offer, press, scope),
    opener,
    suspended,
  );
  return { offer, press, details };
}

export function AndroidApkBanner({
  release,
  suspended,
  hidden,
}: {
  readonly release: AndroidApkRelease | null;
  readonly suspended: boolean;
  readonly hidden: boolean;
}): ReactNode {
  const primaryRef = useRef<View>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const { offer, press, details } = useApkOffer(release, primaryRef, suspended);
  return (
    <>
      {offer === null || hidden || dismissed === offer.key ? null : (
        <OfferNotice
          offer={offer}
          action={offerButton(offer.action, press)}
          actionRef={primaryRef}
          secondaryAction={details.secondaryAction}
          onDismiss={(): void => {
            setDismissed(offer.key);
          }}
        />
      )}
      {details.modal}
    </>
  );
}

export function AndroidApkOffer(): ReactNode {
  const release = useAndroidApkOffer().data ?? null;
  const { offer, press, details } = useApkOffer(release, undefined, false);
  const anchor = useHighlightAnchor(
    release === null ? null : anchorKey.setting(ANDROID_INSTALLER_SETTING),
    'Install Android update',
  );
  if (offer === null) return details.modal;
  return (
    <View {...anchor}>
      <Card title="Android app" icon="download">
        <OfferBlock offer={offer}>
          <View className="flex-row flex-wrap gap-2">
            {offer.action === null ? null : <OfferButton action={offer.action} onPress={press} />}
            {details.secondaryAction === undefined ? null : (
              <Button {...details.secondaryAction} variant="text" />
            )}
          </View>
        </OfferBlock>
      </Card>
      {details.modal}
    </View>
  );
}
