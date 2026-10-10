import type { ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ScopedTheme } from 'uniwind';
import { acknowledgeEvent } from '../../../api/media';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useSizeClass } from '../../../design/size-class';
import { clock } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { PREFS, usePref } from '../../../store/prefs';
import { useSettings } from '../../../store/selectors';
import { useLedger } from '../../../store/store-context';
import { useCameraEntries } from '../data/use-cameras';
import type { CameraEntry } from '../logic/cameras';
import { ringTitle, type Ring } from '../logic/ringing';
import { PlayerStage } from '../player/player-stage';
import { useLiveSession } from '../player/use-live-session';
import { useRingTone } from './ring-tone';
import { useRings } from './use-rings';

const FILL = { flex: 1 };

interface CallProps {
  readonly ring: Ring;
  readonly entry: CameraEntry;
  readonly onDone: () => void;
}

function acknowledged(ring: Ring): void {
  acknowledgeEvent(ring.eventId).catch((error: unknown) => {
    notify({
      message: 'The call wasn’t marked as handled',
      error,
      tone: 'critical',
    });
  });
}

function useCallActions({ ring, entry, onDone }: CallProps): {
  readonly answer: (() => void) | null;
  readonly watch: () => void;
  readonly decline: () => void;
} {
  const router = useRouter();
  const ledger = useLedger();
  const open = (call: boolean): void => {
    acknowledged(ring);
    onDone();
    router.navigate(href.camera(entry.device.id, call ? 'call' : null));
  };
  const hangUp = entry.device.capabilities.find(
    (capability) => capability.key === 'call_hang_up' && capability.access !== 'read',
  );
  return {
    answer:
      entry.camera?.two_way_audio === true
        ? (): void => {
            open(true);
          }
        : null,
    watch: (): void => {
      open(false);
    },
    decline: (): void => {
      if (hangUp !== undefined) {
        void ledger.send(entry.device, hangUp.key, null);
      }
      acknowledged(ring);
      onDone();
    },
  };
}

function Preview({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const live = useLiveSession(entry, { enabled: true, answering: false });
  return (
    <View className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <PlayerStage entry={entry} live={live} compact />
    </View>
  );
}

function Heading({ ring, entry }: Omit<CallProps, 'onDone'>): ReactNode {
  const timeZone = useSettings().time_zone;
  return (
    <View accessibilityLiveRegion="assertive" className="items-center gap-1">
      <View className="size-14 items-center justify-center rounded-full bg-primary-container">
        <Icon name={ring.kind === 'call' ? 'phone' : 'bell'} size={24} tone="primary" />
      </View>
      <Text variant="title-2" align="center" accessibilityRole="header">
        {ringTitle(ring.kind, entry.name)}
      </Text>
      <Text variant="callout" tone="variant" align="center">
        {clock(ring.occurredAt, timeZone)}
      </Text>
    </View>
  );
}

function Actions(props: CallProps): ReactNode {
  const actions = useCallActions(props);
  return (
    <View className="w-full flex-row gap-3">
      <Button
        label="Decline"
        icon="phoneOff"
        variant="destructive"
        size="lg"
        grow
        onPress={actions.decline}
      />
      <Button label="Watch" icon="cameras" variant="tonal" size="lg" grow onPress={actions.watch} />
      {actions.answer === null ? null : (
        <Button label="Answer" icon="phone" size="lg" grow onPress={actions.answer} />
      )}
    </View>
  );
}

function CallScreen(props: CallProps): ReactNode {
  return (
    <Modal visible animationType="slide" onRequestClose={props.onDone} statusBarTranslucent>
      <GestureHandlerRootView style={FILL}>
        <ScopedTheme theme="dark">
          <View className="flex-1 justify-between gap-8 bg-bg px-gutter pb-safe-offset-6 pt-safe-offset-12">
            <Heading ring={props.ring} entry={props.entry} />
            <Preview entry={props.entry} />
            <Actions {...props} />
          </View>
        </ScopedTheme>
      </GestureHandlerRootView>
    </Modal>
  );
}

function CallCard(props: CallProps): ReactNode {
  return (
    <View className="absolute right-4 top-4 z-50 w-popover gap-4 rounded-xl border-hairline border-outline-variant bg-surface-raised p-card-pad elevation-3">
      <Heading ring={props.ring} entry={props.entry} />
      <Preview entry={props.entry} />
      <Actions {...props} />
    </View>
  );
}

function useRingSound(ringing: boolean): void {
  const pref = usePref(PREFS.callRing);
  const now = useMinute();
  const value = pref.status === 'ready' ? pref.value : PREFS.callRing.defaultValue;
  const muted = !value.sound || (value.mutedUntil !== null && Date.parse(value.mutedUntil) > now);
  useRingTone(ringing && !muted);
}

export function CallHost(): ReactNode {
  const entries = useCameraEntries();
  const touch = useSizeClass().idiom === 'touch';
  const { ring, dismiss } = useRings(new Set(entries.map((entry) => entry.device.id)));
  const entry =
    ring === null ? undefined : entries.find((candidate) => candidate.device.id === ring.deviceId);
  useRingSound(entry !== undefined);
  if (ring === null || entry === undefined) {
    return null;
  }
  const props = {
    ring,
    entry,
    onDone: (): void => {
      dismiss(ring.eventId);
    },
  };
  return touch ? <CallScreen {...props} /> : <CallCard {...props} />;
}
