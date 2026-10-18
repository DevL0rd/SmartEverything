import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import type { AiSpeechPref, CallRingPref } from '@smarteverything/domain';
import type { Rect } from '../../../components/anchor';
import { measureAnchor } from '../../../components/anchor';
import { ListRow } from '../../../components/list-row';
import { SelectPicker, type SelectOption } from '../../../components/select-picker';
import { notify, notifyFailure } from '../../../components/toast-store';
import { appPlatform } from '../../../design/platform';
import { clock, moment } from '../../../format/time';
import {
  PUSH_UNAVAILABLE,
  pushPermission,
  registerForPush,
  type PushPermission,
} from '../../../platform/push';
import { useMinute } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { PREFS, prefValueOf, savePref } from '../../../store/prefs';
import { useSettings } from '../../../store/selectors';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';
import { morningAfter, muteUntil, type MuteChoice } from './mute';

import { settingsLog } from '../settings-log';
const PERMISSION_TEXT: Readonly<Record<PushPermission, string>> = {
  granted: 'On',
  denied: 'Off in Android settings',
  undetermined: 'Off',
};

function usePushPermission(): PushPermission | null {
  const [permission, setPermission] = useState<PushPermission | null>(null);
  useEffect(() => {
    const read = (): void => {
      pushPermission().then((value) => {
        settingsLog.debug('push.permission_read', { permission: value });
        setPermission(value);
      }, notifyFailure('Notification status unknown'));
    };
    read();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        read();
      }
    });
    return (): void => {
      subscription.remove();
    };
  }, []);
  return permission;
}

export function PhonePushRow(): ReactNode {
  const permission = usePushPermission();
  const registration = useMutationState();
  return (
    <ListRow
      title="Alerts on this phone"
      subtitle="Doorbell, calls, leaks and alarms"
      icon="bell"
      value={permission === null ? '…' : PERMISSION_TEXT[permission]}
      disabled={registration.busy}
      chevron
      onPress={() => {
        registration.run(registerForPush, {
          failure: 'Alerts were not turned on',
          onDone: (result) => {
            notify(
              result.registered
                ? { message: 'This phone gets alerts', tone: 'positive' }
                : { message: result.reason, tone: 'critical' },
            );
          },
        });
      }}
    />
  );
}

export function ScreenAlertsRow(): ReactNode {
  const platform = appPlatform();
  if (platform === 'android') {
    return null;
  }
  return (
    <ListRow
      title={platform === 'desktop' ? 'Alerts on this computer' : 'Alerts in this browser'}
      subtitle={PUSH_UNAVAILABLE[platform]}
      icon="bell"
    />
  );
}

export const callRingOf = (state: StoreState): CallRingPref => prefValueOf(state, PREFS.callRing);

export const aiSpeechOf = (state: StoreState): AiSpeechPref => prefValueOf(state, PREFS.aiSpeech);

function muteOptions(now: number, timeZone: string): readonly SelectOption<MuteChoice>[] {
  return [
    { value: 'off', label: 'Off' },
    { value: 'hour', label: 'For 1 hour' },
    { value: 'morning', label: `Until ${clock(morningAfter(now, timeZone), timeZone)}` },
  ];
}

export function MuteRingsRow(): ReactNode {
  const store = useEntityStore();
  const ring = useStoreSelector(callRingOf);
  const now = useMinute();
  const zone = useSettings().time_zone;
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const muted = ring.mutedUntil !== null && Date.parse(ring.mutedUntil) > now;
  return (
    <View ref={ref} collapsable={false}>
      <ListRow
        title="Mute rings"
        icon="bellOff"
        value={
          muted && ring.mutedUntil !== null ? `Until ${moment(ring.mutedUntil, now, zone)}` : 'Off'
        }
        chevron
        onPress={() => {
          measureAnchor(ref, setAnchor);
        }}
      />
      <SelectPicker
        label="Mute rings"
        options={muteOptions(now, zone)}
        value={muted ? null : 'off'}
        anchor={anchor}
        onPick={(choice) => {
          savePref(store, PREFS.callRing, {
            ...callRingOf(store.get()),
            mutedUntil: muteUntil(choice, Date.now(), zone),
          });
        }}
        onClose={() => {
          setAnchor(null);
        }}
      />
    </View>
  );
}
