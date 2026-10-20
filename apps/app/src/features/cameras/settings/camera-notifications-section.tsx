import type { ReactNode } from 'react';
import {
  CAMERA_NOTIFICATION_HINTS,
  CAMERA_NOTIFICATION_LABELS,
  cameraNotificationOn,
  cameraNotificationOverride,
  cameraQuietHours,
  withCameraCooldown,
  withCameraNotification,
  withCameraQuiet,
  type CameraNotificationsPref,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import {
  CAMERA_NOTIFICATION_ICONS,
  CAMERA_NOTIFICATION_ORDER,
  FOLLOW_DEFAULT,
  NO_QUIET_HOURS,
  cooldownOptions,
  quietFromValue,
  quietOptions,
  quietValue,
} from '../../../components/camera-notification-options';
import { ListRow } from '../../../components/list-row';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { PREFS, usePref } from '../../../store/prefs';

function cooldownValue(pref: CameraNotificationsPref, deviceId: string): string {
  const own = cameraNotificationOverride(pref, deviceId).cooldownMinutes;
  return own === null ? FOLLOW_DEFAULT : String(own);
}

function quietChoice(pref: CameraNotificationsPref, deviceId: string): string {
  const own = cameraNotificationOverride(pref, deviceId).quiet;
  if (own === null) {
    return FOLLOW_DEFAULT;
  }
  return own === 'off' ? NO_QUIET_HOURS : quietValue(own);
}

function withQuietChoice(
  pref: CameraNotificationsPref,
  deviceId: string,
  choice: string,
): CameraNotificationsPref {
  if (choice === FOLLOW_DEFAULT) {
    return withCameraQuiet(pref, deviceId, null);
  }
  const quiet = choice === NO_QUIET_HOURS ? NO_QUIET_HOURS : quietFromValue(choice);
  return quiet === null ? pref : withCameraQuiet(pref, deviceId, quiet);
}

function KindRows({
  pref,
  deviceId,
  save,
}: {
  readonly pref: CameraNotificationsPref;
  readonly deviceId: string;
  readonly save: (next: CameraNotificationsPref) => void;
}): ReactNode {
  return CAMERA_NOTIFICATION_ORDER.map((kind) => (
    <SwitchRow
      key={kind}
      title={CAMERA_NOTIFICATION_LABELS[kind]}
      subtitle={CAMERA_NOTIFICATION_HINTS[kind]}
      wrapSubtitle
      icon={CAMERA_NOTIFICATION_ICONS[kind]}
      value={cameraNotificationOn(pref, deviceId, kind)}
      onChange={(on) => {
        save(withCameraNotification(pref, deviceId, kind, on));
      }}
    />
  ));
}

function TimingRows({
  pref,
  deviceId,
  save,
}: {
  readonly pref: CameraNotificationsPref;
  readonly deviceId: string;
  readonly save: (next: CameraNotificationsPref) => void;
}): ReactNode {
  return (
    <>
      <SelectRow
        title="One notice per kind every"
        icon="timer"
        options={cooldownOptions(true)}
        value={cooldownValue(pref, deviceId)}
        onChange={(choice) => {
          save(
            withCameraCooldown(pref, deviceId, choice === FOLLOW_DEFAULT ? null : Number(choice)),
          );
        }}
      />
      <SelectRow
        title="Quiet hours"
        icon="moon"
        options={quietOptions(cameraQuietHours(pref, deviceId))}
        value={quietChoice(pref, deviceId)}
        onChange={(choice) => {
          save(withQuietChoice(pref, deviceId, choice));
        }}
      />
    </>
  );
}

export function CameraNotificationsSection({ deviceId }: { readonly deviceId: string }): ReactNode {
  const read = usePref(PREFS.cameraNotifications);
  if (read.status === 'invalid') {
    return (
      <List title="Notifications">
        <ListRow
          icon="bell"
          title="Notifications"
          subtitle="This setting couldn’t be read"
          subtitleTone="critical"
          trailing={<Button label="Reset" variant="tonal" onPress={read.reset} />}
        />
      </List>
    );
  }
  return (
    <>
      <List
        title="Notifications"
        footer="Choose which events from this camera reach your phones. Defaults are set in Settings, Notifications."
      >
        <KindRows pref={read.value} deviceId={deviceId} save={read.set} />
      </List>
      <List footer="A camera stays quiet for a kind of event after it notified. A camera that goes offline notifies once an hour at most, until it is back.">
        <TimingRows pref={read.value} deviceId={deviceId} save={read.set} />
      </List>
    </>
  );
}
