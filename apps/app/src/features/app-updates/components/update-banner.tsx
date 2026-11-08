import type { MachineUpdateStatus } from '@smarteverything/domain';
import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { View } from 'react-native';
import { focusView } from '../../../components/focus-request';
import { useUpdateDetailsFallback } from '../../../components/update-details-focus';
import { UpdateNotice } from '../../../components/update-notice';
import { useUpdateDetails, type UpdateDetailsOffer } from '../../../components/use-update-details';
import { useValue } from '../../../design/external-store';
import { desktopBridge, isNative, type DesktopBridge } from '../../../design/platform';
import { bytes } from '../../../format/number';
import { shortDate } from '../../../format/time';
import { useDesktopInstaller } from '../data/desktop-installer';
import { pendingRestart, settleRestart } from '../data/restart-confirmation';
import { useAndroidApkOffer } from '../data/android-apk';
import type { AppUpdateActions } from '../data/update-store';
import { useAppUpdate } from '../data/update-store';
import { DESKTOP_RESTART_PENDING_HINT, bannerOf } from '../model/update-copy';
import type { ReleaseOffer } from '../model/release-offer';
import { otaUpdateDetailsOf } from '../model/update-details';
import type { AppUpdateState } from '../model/update-state';
import { AndroidApkBanner } from './android-apk-offer';
import { AndroidUpdateHistory } from './android-update-history';
import { DesktopInstallerBanner, type DesktopInstaller } from './desktop-installer-banner';
import { OfferNotice, offerButton, offerDetailsFooter, useShellScope } from './offer-notice';

type Confirmation = ReturnType<typeof pendingRestart.get>;

export function offerPress(
  offer: ReleaseOffer,
  actions: AppUpdateActions,
  restoreFocus?: () => void,
): (() => void) | undefined {
  const { action, offerId } = offer;
  if (action === null || action.busy) return undefined;
  const expected = offerId ?? undefined;
  switch (action.kind) {
    case 'update':
      return offerId === null
        ? undefined
        : (): void => {
            actions.download(offerId);
          };
    case 'restart':
      return (): void => {
        actions.restart(expected, restoreFocus);
      };
    case 'retry':
    case 'check':
      return (): void => {
        actions.retry(expected);
      };
    case 'cancel':
      return undefined;
  }
}

function detailsPress(
  offer: ReleaseOffer,
  actions: AppUpdateActions,
  fallback: RefObject<View | null>,
): ((opener: RefObject<View | null>) => void) | undefined {
  if (offerPress(offer, actions) === undefined) return undefined;
  return (opener): void => {
    offerPress(offer, actions, () => {
      if (!focusView(opener.current)) focusView(fallback.current, true);
    })?.();
  };
}

export function appDetailsOf(
  state: AppUpdateState,
  offer: ReleaseOffer | null,
  onPress: ((opener: RefObject<View | null>) => void) | undefined,
  scope: unknown,
): UpdateDetailsOffer | null {
  const release = otaUpdateDetailsOf(state);
  if (release === null || offer === null) return null;
  const { offerId, appVersion, createdAt, size, notes } = release;
  return {
    id: offerId,
    scope,
    content: {
      title: `SmartEverything ${appVersion}`,
      target: 'App update',
      metadata: [shortDate(createdAt), bytes(size)],
      notes: notes?.full,
    },
    releaseNotesContent: isNative() ? (
      <AndroidUpdateHistory offerKind="ota" offerId={offerId} notes={notes?.full} />
    ) : undefined,
    footer: offerDetailsFooter(offer, onPress),
    ...(state.kind === 'failed' ? { status: { label: state.reason, tone: 'critical' } } : {}),
  };
}

function RestartNotice({
  pending,
  onCancel,
}: {
  readonly pending: NonNullable<Confirmation>;
  readonly onCancel: () => void;
}): ReactNode {
  const { title, body, confirmLabel, cancelLabel } = pending.request;
  const safeAction = useRef<View>(null);
  useEffect(() => {
    if (!isNative()) safeAction.current?.focus();
  }, [pending]);
  return (
    <UpdateNotice
      tone="info"
      title={title}
      body={body}
      wrapBody
      announceTitle
      action={{
        label: confirmLabel,
        variant: 'outlined',
        onPress: (): void => {
          settleRestart(pending, true);
        },
      }}
      secondaryAction={{
        label: cancelLabel,
        ref: safeAction,
        onPress: (): void => {
          settleRestart(pending, false);
          onCancel();
        },
      }}
    />
  );
}

function installerOf(
  bridge: DesktopBridge | null,
  status: MachineUpdateStatus | null,
): DesktopInstaller | null {
  if (bridge === null || status === null || status.state === 'none' || status.version === null)
    return null;
  return { bridge, status: { ...status, version: status.version } };
}

function shownDuringConfirmation(
  offer: ReleaseOffer | null,
  confirmation: Confirmation,
): ReleaseOffer | null {
  if (confirmation?.source === 'ui') return null;
  if (confirmation === null || offer?.action?.kind !== 'restart') return offer;
  return { ...offer, action: null, brief: undefined, sentence: DESKTOP_RESTART_PENDING_HINT };
}

interface Dismissal {
  readonly key: string | null;
  readonly set: (key: string) => void;
}

function AppUpdatePrompt({
  offer,
  state,
  actions,
  suspended,
  dismissed,
  buttonRef,
}: {
  readonly offer: ReleaseOffer | null;
  readonly state: AppUpdateState;
  readonly actions: AppUpdateActions;
  readonly suspended: boolean;
  readonly dismissed: Dismissal;
  readonly buttonRef: RefObject<View | null>;
}): ReactNode {
  const scope = useShellScope();
  const fallback = useUpdateDetailsFallback(buttonRef);
  const press = offer === null ? undefined : offerPress(offer, actions);
  const onDetails = offer === null ? undefined : detailsPress(offer, actions, fallback);
  const details = useUpdateDetails(
    appDetailsOf(state, offer, onDetails, scope),
    buttonRef,
    suspended,
  );
  return (
    <>
      {offer === null || dismissed.key === offer.key ? null : (
        <OfferNotice
          offer={offer}
          action={offerButton(offer.action, press)}
          actionRef={buttonRef}
          secondaryAction={details.secondaryAction}
          onDismiss={(): void => {
            dismissed.set(offer.key);
          }}
        />
      )}
      {details.modal}
    </>
  );
}

function useRestartNotice(state: AppUpdateState): Confirmation {
  const pending = useValue(pendingRestart);
  return pending?.source === 'desktop' || state.kind === 'ready' ? pending : null;
}

function restoreRestartFocus(
  confirmation: NonNullable<Confirmation>,
  installerButton: RefObject<View | null>,
  restartButton: RefObject<View | null>,
): void {
  if (isNative() && confirmation.restoreFocus === undefined) return;
  requestAnimationFrame(() => {
    if (confirmation.restoreFocus !== undefined) confirmation.restoreFocus();
    else if (confirmation.source === 'desktop' && installerButton.current !== null)
      installerButton.current.focus();
    else restartButton.current?.focus();
  });
}

export function AppUpdateBanner({
  offersHidden = false,
}: {
  readonly offersHidden?: boolean;
}): ReactNode {
  const { state, actions } = useAppUpdate();
  const apk = useAndroidApkOffer().data ?? null;
  const confirmation = useRestartNotice(state);
  const bridge = desktopBridge();
  const installerButton = useRef<View>(null);
  const restartButton = useRef<View>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const desktop = installerOf(bridge, useDesktopInstaller(bridge));
  const offer = shownDuringConfirmation(bannerOf(state), confirmation);
  const otaShown = offer !== null && dismissed !== offer.key;
  const othersHidden = offersHidden || otaShown;
  return (
    <>
      {confirmation === null ? null : (
        <RestartNotice
          pending={confirmation}
          onCancel={(): void => {
            restoreRestartFocus(confirmation, installerButton, restartButton);
          }}
        />
      )}
      <AppUpdatePrompt
        offer={offersHidden ? null : offer}
        state={state}
        actions={actions}
        suspended={confirmation !== null}
        dismissed={{ key: dismissed, set: setDismissed }}
        buttonRef={restartButton}
      />
      <AndroidApkBanner release={apk} suspended={confirmation !== null} hidden={othersHidden} />
      <DesktopInstallerBanner
        installer={desktop}
        buttonRef={installerButton}
        suspended={confirmation !== null}
        hidden={othersHidden || confirmation?.source === 'desktop'}
      />
    </>
  );
}
