import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Logger } from '@smarteverything/logging';
import { ThemeScope } from '../../../design/theme-scope';
import { useKeyboard, type KeyPress } from '../../../app-shell/shortcuts';
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
import { PlayerStage } from '../player/player-stage';
import { useScreenSession } from '../player/use-live-session';

const log = new Logger('app.cameras');

const FILL = { flex: 1 };

const LIVE_TILES_AT_MOST = 4;

function LiveTile({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const live = useScreenSession(entry, { enabled: true, answering: false });
  return <PlayerStage entry={entry} live={live} compact />;
}

function Tile({
  entry,
  live,
  onFocus,
}: {
  readonly entry: CameraEntry;
  readonly live: boolean;
  readonly onFocus: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`Focus ${entry.name}`}
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
        className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1"
      >
        <Text variant="label">{entry.name}</Text>
      </View>
    </Interactive>
  );
}

function rowsOf(entries: readonly CameraEntry[]): CameraEntry[][] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
  const rows: CameraEntry[][] = [];
  for (let index = 0; index < entries.length; index += columns) {
    rows.push(entries.slice(index, index + columns));
  }
  return rows;
}

function useMonitorKeys(
  entries: readonly CameraEntry[],
  focused: string | null,
  setFocused: (id: string | null) => void,
  leave: (() => void) | null,
): void {
  useKeyboard((press: KeyPress): boolean => {
    if (leave === null || press.typing || press.command || press.alt) {
      return false;
    }
    if (press.key === 'Escape') {
      if (focused === null) {
        leave();
      } else {
        setFocused(null);
      }
      return true;
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
  const live = shown.length <= LIVE_TILES_AT_MOST;
  return rowsOf(shown).map((row) => (
    <View key={row.map((entry) => entry.device.id).join()} className="flex-1 flex-row gap-0.5">
      {row.map((entry) => (
        <Tile
          key={entry.device.id}
          entry={entry}
          live={live}
          onFocus={() => {
            setFocused(focused === null ? entry.device.id : null);
          }}
        />
      ))}
    </View>
  ));
}

export function MonitorScreen(): ReactNode {
  const router = useRouter();
  const entries = useCameraEntries();
  const visible = useIsFocused();
  const [focused, setFocused] = useState<string | null>(null);
  const cameraCount = entries.length;
  useLifecycleLog(log, 'monitor');
  useEffect(() => {
    log.info('monitor.focus_changed', { focused, cameras: cameraCount, visible });
  }, [focused, cameraCount, visible]);
  const leave = (): void => {
    router.back();
  };
  useMonitorKeys(entries, focused, setFocused, visible ? leave : null);
  const shown = focused === null ? entries : entries.filter((entry) => entry.device.id === focused);
  return (
    <Modal
      visible={visible}
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={leave}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={FILL}>
        <ThemeScope theme="dark">
          <View className="flex-1 gap-0.5 bg-black">
            <Wall shown={shown} focused={focused} setFocused={setFocused} />
            <Corner leave={leave} />
          </View>
        </ThemeScope>
      </GestureHandlerRootView>
    </Modal>
  );
}
