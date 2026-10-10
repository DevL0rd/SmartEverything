import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import type { AiSpeechPref, CallRingPref } from '@smarteverything/domain';
import type { Rect } from '../../../components/anchor';
import { measureAnchor } from '../../../components/anchor';
import { ListRow } from '../../../components/list-row';
import { SelectPicker } from '../../../components/select-picker';
import { notify } from '../../../components/toast-store';
import { appPlatform } from '../../../design/platform';
import { moment } from '../../../format/time';
import {
  PUSH_UNAVAILABLE,
  pushPermission,
  registerForPush,
  type PushPermission,
} from '../../../platform/push';
import { useMinute } from '../../../store/clock';
import { PREFS, savePref } from '../../../store/prefs';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';

const PERMISSION_TEXT: Readonly<Record<PushPermission, string>> = {
  granted: 'On',
  denied: 'Off in Android settings',
  undetermined: 'Off',
};

function usePushPermission(): PushPermission | null {
  const [permission, setPermission] = useState<PushPermission | null>(null);
  useEffect(() => {
    const read = (): void => {
      pushPermission().then(setPermission, (error: unknown) => {
        notify({ message: 'Notification status unknown', error, tone: 'critical' });
      });
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
  const [busy, setBusy] = useState(false);
  return (
    <ListRow
      title="Alerts on this phone"
      subtitle="Doorbell, calls, leaks and alarms"
      icon="bell"
      value={permission === null ? '…' : PERMISSION_TEXT[permission]}
      disabled={busy}
      chevron
      onPress={() => {
        setBusy(true);
        registerForPush().then(
          (registration) => {
            setBusy(false);
            notify(
              registration.registered
                ? { message: 'This phone gets alerts', tone: 'positive' }
                : { message: registration.reason, tone: 'critical' },
            );
          },
          (error: unknown) => {
            setBusy(false);
            notify({
              message: 'Alerts were not turned on',
              error,
              tone: 'critical',
            });
          },
        );
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

export function callRingOf(state: StoreState): CallRingPref {
  const read = PREFS.callRing.decode(
    state.tables.layouts.byId[PREFS.callRing.storageKey]?.layout ?? null,
  );
  return read.status === 'invalid' ? PREFS.callRing.defaultValue : read.value;
}

export function aiSpeechOf(state: StoreState): AiSpeechPref {
  const read = PREFS.aiSpeech.decode(
    state.tables.layouts.byId[PREFS.aiSpeech.storageKey]?.layout ?? null,
  );
  return read.status === 'invalid' ? PREFS.aiSpeech.defaultValue : read.value;
}

type MuteChoice = 'off' | 'hour' | 'morning';

const MUTE_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'hour', label: 'For 1 hour' },
  { value: 'morning', label: 'Until 07:00' },
] as const;

const MORNING_HOUR = 7;

function muteUntil(choice: MuteChoice, now: Date): string | null {
  if (choice === 'off') {
    return null;
  }
  if (choice === 'hour') {
    return new Date(now.getTime() + 60 * 60_000).toISOString();
  }
  const morning = new Date(now);
  morning.setHours(MORNING_HOUR, 0, 0, 0);
  if (morning <= now) {
    morning.setDate(morning.getDate() + 1);
  }
  return morning.toISOString();
}

export function MuteRingsRow(): ReactNode {
  const store = useEntityStore();
  const ring = useStoreSelector(callRingOf);
  const now = useMinute();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const muted = ring.mutedUntil !== null && Date.parse(ring.mutedUntil) > now;
  return (
    <View ref={ref} collapsable={false}>
      <ListRow
        title="Mute rings"
        icon="bellOff"
        value={muted && ring.mutedUntil !== null ? `Until ${moment(ring.mutedUntil, now)}` : 'Off'}
        chevron
        onPress={() => {
          measureAnchor(ref, setAnchor);
        }}
      />
      <SelectPicker
        label="Mute rings"
        options={MUTE_OPTIONS}
        value={muted ? null : 'off'}
        anchor={anchor}
        onPick={(choice) => {
          savePref(store, PREFS.callRing, {
            ...callRingOf(store.get()),
            mutedUntil: muteUntil(choice, new Date()),
          });
        }}
        onClose={() => {
          setAnchor(null);
        }}
      />
    </View>
  );
}
