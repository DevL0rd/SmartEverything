import { useRef, type ReactNode, type RefObject } from 'react';
import { background } from '@smarteverything/logging';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ActionRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { useUpdateDetails } from '../../../components/use-update-details';
import { useValue } from '../../../design/external-store';
import { isNative } from '../../../design/platform';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useSettingsFocus } from '../../../settings/settings-focus';
import { useMinute } from '../../../store/clock';
import { HubUpdateCards } from '../../hub-updates';
import { pendingRestart, settleRestart } from '../data/restart-confirmation';
import { useUpdateChecks } from '../data/update-checks';
import type { AppUpdateActions } from '../data/update-store';
import { useAppUpdate } from '../data/update-store';
import type { AppUpdateView } from '../data/update-controller';
import {
  DESKTOP_RESTART_PENDING_HINT,
  checkRowOf,
  offerViewOf,
  runningLabel,
} from '../model/update-copy';
import type { ReleaseOffer } from '../model/release-offer';
import type { AppUpdateState } from '../model/update-state';
import { AndroidApkOffer } from './android-apk-offer';
import { DesktopInstallerRows } from './desktop-installer-rows';
import { OfferBlock, OfferButton } from './offer-block';
import { useShellScope } from './offer-notice';
import { appDetailsOf, offerPress } from './update-banner';
import { APP_UPDATES_PAGE, SETTINGS } from '../settings';

export const INSTALLER_FOOTER = 'Installs a new version of the desktop app itself.';

type Pending = NonNullable<ReturnType<typeof pendingRestart.get>>;

function SettingsRestartConfirmation({
  pending,
  restoreFocus,
}: {
  readonly pending: Pending;
  readonly restoreFocus: () => void;
}): ReactNode {
  if (pending.source === 'desktop')
    return (
      <Text variant="callout" tone="variant">
        {DESKTOP_RESTART_PENDING_HINT}
      </Text>
    );
  const { title, body, confirmLabel, cancelLabel } = pending.request;
  return (
    <Banner
      tone="info"
      title={title}
      body={body}
      wrapBody
      action={{
        label: confirmLabel,
        variant: 'filled',
        onPress: (): void => {
          settleRestart(pending, true);
        },
      }}
      secondaryAction={{
        label: cancelLabel,
        onPress: (): void => {
          settleRestart(pending, false);
          if (!isNative()) requestAnimationFrame(restoreFocus);
        },
      }}
    />
  );
}

function useSettingsDetails(
  state: AppUpdateState,
  offer: ReleaseOffer,
  press: (() => void) | undefined,
  opener: RefObject<View | null>,
): ReturnType<typeof useUpdateDetails> {
  const scope = useShellScope();
  const pending = useValue(pendingRestart);
  const onDetails =
    press === undefined
      ? undefined
      : (): void => {
          press();
        };
  return useUpdateDetails(
    isNative() ? appDetailsOf(state, offer, onDetails, scope) : null,
    opener,
    pending !== null,
  );
}

function MainAction({
  state,
  offer,
  actions,
}: {
  readonly state: AppUpdateState;
  readonly offer: ReleaseOffer;
  readonly actions: AppUpdateActions;
}): ReactNode {
  const pending = useValue(pendingRestart);
  const button = useRef<View>(null);
  const press = offerPress(offer, actions);
  const details = useSettingsDetails(state, offer, press, button);
  if (offer.action === null) return details.modal;
  if (offer.action.kind === 'restart' && pending !== null)
    return (
      <SettingsRestartConfirmation
        pending={pending}
        restoreFocus={(): void => {
          button.current?.focus();
        }}
      />
    );
  return (
    <View className="flex-row flex-wrap gap-2">
      <OfferButton action={offer.action} onPress={press} buttonRef={button} />
      {details.secondaryAction === undefined ? null : (
        <Button {...details.secondaryAction} variant="text" />
      )}
      {details.modal}
    </View>
  );
}

export function UpdateStatusCard({
  view,
  actions,
}: {
  readonly view: AppUpdateView;
  readonly actions: AppUpdateActions;
}): ReactNode {
  const offer = offerViewOf(view.state);
  return (
    <Card title="This app" icon="download">
      <View className="gap-3">
        <Text variant="footnote" tone="variant">
          {`Running · ${runningLabel(view.running)}`}
        </Text>
        <OfferBlock offer={offer}>
          <MainAction state={view.state} offer={offer} actions={actions} />
        </OfferBlock>
      </View>
    </Card>
  );
}

function CheckForUpdates({
  state,
  checking,
  check,
}: {
  readonly state: AppUpdateState;
  readonly checking: boolean;
  readonly check: () => Promise<void>;
}): ReactNode {
  const row = checkRowOf(state, checking, useMinute());
  return (
    <List>
      <ActionRow
        icon="refresh"
        title="Check for updates"
        subtitle={row.subtitle}
        disabled={row.disabled}
        onPress={(): void => {
          background(check(), 'app_update.check_failed');
        }}
      />
    </List>
  );
}

export function AppUpdatesScreen(): ReactNode {
  useSettingsFocus(SETTINGS);
  const { state, running, actions } = useAppUpdate();
  const { check, checking, available, installer, hubSource } = useUpdateChecks(state, actions);
  return (
    <SettingsFrame page={APP_UPDATES_PAGE}>
      {available ? <CheckForUpdates state={state} checking={checking} check={check} /> : null}
      <UpdateStatusCard view={{ state, running }} actions={actions} />
      <AndroidApkOffer />
      {installer === null ? null : (
        <List title="Desktop app" footer={INSTALLER_FOOTER}>
          <DesktopInstallerRows bridge={installer} manualCheck={false} />
        </List>
      )}
      <HubUpdateCards source={hubSource} />
    </SettingsFrame>
  );
}
