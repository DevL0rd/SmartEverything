import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import type { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { useUpdateDetails, type UpdateDetailsOffer } from '../../../components/use-update-details';
import { useUpdateDetailsFallback } from '../../../components/update-details-focus';
import type { DesktopBridge } from '../../../design/platform';
import { requestDesktopInstall, useDesktopInstallBlock } from '../data/desktop-install-action';
import { desktopOfferOf, type InstallerStatus } from '../model/desktop-offer';
import type { ReleaseOffer } from '../model/release-offer';
import { OfferNotice, offerButton, offerDetailsFooter } from './offer-notice';

export interface DesktopInstaller {
  readonly bridge: Pick<DesktopBridge, 'installUpdate' | 'checkForUpdate'>;
  readonly status: InstallerStatus;
}

type Opened = (opener: RefObject<View | null>) => void;

function installerPress(
  installer: DesktopInstaller,
  offer: ReleaseOffer,
  fallback: RefObject<View | null>,
): Opened | undefined {
  const { bridge, status } = installer;
  if (offer.action?.kind === 'retry')
    return (): void => {
      background(bridge.checkForUpdate(), 'desktop_update.check_failed');
    };
  const { offerId } = status;
  if (offer.action?.kind !== 'update' || offerId === undefined) return undefined;
  const install = bridge.installUpdate.bind(bridge);
  return (opener): void => {
    background(
      requestDesktopInstall(install, { version: status.version, id: offerId }, () => {
        (opener.current ?? fallback.current)?.focus();
      }),
      'desktop_update.install_failed',
    );
  };
}

function installerDetailsOf(
  installer: DesktopInstaller | null,
  offer: ReleaseOffer | null,
  press: Opened | undefined,
): UpdateDetailsOffer | null {
  if (installer === null || offer === null) return null;
  const { bridge, status } = installer;
  if (status.offerId === undefined) return null;
  return {
    id: status.offerId,
    scope: bridge,
    content: {
      title: `SmartEverything ${status.version}`,
      target: 'Desktop app',
      notes: offer.notes,
    },
    footer: offerDetailsFooter(offer, press),
  };
}

export function DesktopInstallerBanner({
  installer,
  buttonRef,
  suspended,
  hidden,
}: {
  readonly installer: DesktopInstaller | null;
  readonly buttonRef: RefObject<View | null>;
  readonly suspended: boolean;
  readonly hidden: boolean;
}): ReactNode {
  const blocked = useDesktopInstallBlock();
  const fallback = useUpdateDetailsFallback(buttonRef);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const offer = installer === null ? null : desktopOfferOf(installer.status, blocked);
  const press =
    installer === null || offer === null ? undefined : installerPress(installer, offer, fallback);
  const details = useUpdateDetails(
    installerDetailsOf(installer, offer, press),
    buttonRef,
    suspended,
  );
  return (
    <>
      {hidden || offer === null || dismissed === offer.key ? null : (
        <OfferNotice
          offer={offer}
          action={offerButton(
            offer.action,
            press === undefined
              ? undefined
              : (): void => {
                  press(buttonRef);
                },
          )}
          actionRef={buttonRef}
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
