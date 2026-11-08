import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Logger } from '@smarteverything/logging';
import { isNative } from '../../../design/platform';
import { ThemeScope } from '../../../design/theme-scope';
import { useKeyboard, type KeyPress } from '../../../app-shell/shortcuts';
import { ToastModal } from '../../../components/toast-modal';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { ClockText } from '../../../components/time-text';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { CameraSnapshot } from '../../device-visuals';
import { useCameraEntries } from '../data/use-cameras';
import type { CameraEntry } from '../logic/cameras';
import { monitorLayout } from '../logic/monitor-layout';
import { PlayerStage } from '../player/player-stage';
import { useScreenSession } from '../player/use-live-session';

const log = new Logger('app.cameras');

const FILL = { flex: 1 };

const LIVE_TILES_AT_MOST = 4;

function LiveTile({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const live = useScreenSession(entry, { enabled: true, answering: false });
  return <PlayerStage entry={entry} live={live} compact cameraNameShown />;
}

function Tile({
  entry,
  live,
  onFocus,
  focused,
}: {
  readonly entry: CameraEntry;
  readonly live: boolean;
  readonly onFocus: () => void;
  readonly focused: boolean;
}): ReactNode {
  return (
    <Interactive
      label={focused ? 'Show all cameras' : `Focus ${entry.name}`}
      onPress={onFocus}
      className="min-w-0 flex-1 bg-black"
    >
      {live ? (
        <LiveTile entry={entry} />
      ) : (
        <CameraSnapshot deviceId={entry.device.id} label={entry.name} />
      )}
      <View
        pointerEvents="none"
        className="absolute inset-x-3 bottom-3 top-3 items-start justify-end overflow-hidden"
      >
        <View className="max-w-full rounded-full bg-black/60 px-3 py-1">
          <Text variant="label">{entry.name}</Text>
        </View>
      </View>
    </Interactive>
  );
}

function useMonitorKeys(
  entries: readonly CameraEntry[],
  setFocused: (id: string | null) => void,
  visible: boolean,
): void {
  useKeyboard((press: KeyPress): boolean => {
    if (!visible || press.typing || press.command || press.alt) {
      return false;
    }
    const picked = /^[1-9]$/.test(press.key) ? entries[Number(press.key) - 1] : undefined;
    if (picked !== undefined) {
      setFocused(picked.device.id);
      return true;
    }
    return false;
  });
}

function Corner({ leave }: { readonly leave: () => void }): ReactNode {
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  return (
    <View className="absolute right-3 top-3 flex-row items-center gap-2 pt-safe">
      <View className="rounded-full bg-black/60 px-3 py-1">
        <ClockText at={new Date(now)} timeZone={timeZone} variant="label" />
      </View>
      <IconButton
        icon="close"
        label="Leave monitor mode"
        variant="overlay"
        shortcut="Esc"
        onPress={leave}
      />
    </View>
  );
}

interface WallProps {
  readonly shown: readonly CameraEntry[];
  readonly focused: string | null;
  readonly setFocused: (id: string | null) => void;
}

function Wall({ shown, focused, setFocused }: WallProps): ReactNode {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const live = shown.length <= LIVE_TILES_AT_MOST;
  const boxes = monitorLayout(size, shown.length, live);
  const measure = ({ nativeEvent: { layout } }: LayoutChangeEvent): void => {
    setSize({ width: layout.width, height: layout.height });
  };
  return (
    <View onLayout={measure} className="flex-1 justify-center">
      {shown.length === 0 ? (
        <EmptyState icon="film" title="No cameras" body="Available cameras appear here." />
      ) : (
        shown.map((entry, index) => {
          const box = boxes[index];
          return box === undefined ? null : (
            <View key={entry.device.id} className="absolute" style={box}>
              <Tile
                entry={entry}
                live={live}
                focused={focused !== null}
                onFocus={() => {
                  setFocused(focused === null ? entry.device.id : null);
                }}
              />
            </View>
          );
        })
      )}
    </View>
  );
}

export function MonitorScreen(): ReactNode {
  const router = useRouter();
  const entries = useCameraEntries();
  const visible = useIsFocused();
  const [focused, setFocused] = useState<string | null>(null);
  const selected = entries.find((entry) => entry.device.id === focused);
  const active = selected?.device.id ?? null;
  const shown = selected === undefined ? entries : [selected];
  const cameraCount = entries.length;
  useLifecycleLog(log, 'monitor');
  useEffect(() => {
    log.info('monitor.focus_changed', { focused: active, cameras: cameraCount, visible });
  }, [active, cameraCount, visible]);
  const leave = (): void => {
    router.back();
  };
  const requestClose = (): void => {
    if (!isNative() && active !== null) {
      setFocused(null);
    } else {
      leave();
    }
  };
  useMonitorKeys(entries, setFocused, visible);
  return (
    <ToastModal
      visible={visible}
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={FILL}>
        <ThemeScope theme="dark">
          <View className="flex-1 bg-black">
            <Wall shown={shown} focused={active} setFocused={setFocused} />
            <Corner leave={leave} />
          </View>
        </ThemeScope>
      </GestureHandlerRootView>
    </ToastModal>
  );
}
