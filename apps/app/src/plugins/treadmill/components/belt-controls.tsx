import type { BeltMode, BeltState, TreadmillStateView } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { useControl } from '../../../store/control';
import { useLiveSelect } from '../data/treadmill-data';
import { controlsOf, type Controls } from '../model/treadmill-model';
import { HoldStart } from './hold-start';
import { InclinePanel } from './incline-panel';
import { SpeedPanel } from './speed-panel';

const MODES: readonly { readonly value: BeltMode; readonly label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'auto', label: 'Auto' },
  { value: 'standby', label: 'Standby' },
];

type Command = 'start' | 'stop' | 'pause' | 'resume';

interface Props {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}

function useCommand(deviceId: string): {
  readonly pending: boolean;
  readonly stopping: boolean;
  readonly send: (command: Command) => void;
} {
  const control = useControl(deviceId, 'belt_command');
  const stopping = control.pending && control.value === 'stop';
  return {
    pending: control.pending,
    stopping,
    send: (command): void => {
      if (command === 'stop' ? !stopping : !control.pending) {
        background(control.set(command), 'control.set_failed');
      }
    },
  };
}

export function useStopBelt(deviceId: string): {
  readonly pending: boolean;
  readonly press: () => void;
} {
  const { stopping, send } = useCommand(deviceId);
  return {
    pending: stopping,
    press: (): void => {
      send('stop');
    },
  };
}

function StopButton({
  stopping,
  enabled,
  send,
}: {
  readonly stopping: boolean;
  readonly enabled: boolean;
  readonly send: (command: Command) => void;
}): ReactNode {
  return (
    <View className="flex-1">
      <Button
        label="Stop"
        icon="square"
        variant="destructive"
        size="lg"
        grow
        disabled={stopping || !enabled}
        hint="Stops the belt"
        onPress={() => {
          send('stop');
        }}
      />
    </View>
  );
}

function RunRow({
  deviceId,
  state,
  controls,
  reason,
}: {
  readonly deviceId: string;
  readonly state: BeltState;
  readonly controls: Controls;
  readonly reason: string | null;
}): ReactNode {
  const { pending, stopping, send } = useCommand(deviceId);
  const paused = state === 'paused';
  return (
    <View className="gap-2">
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button
            label={paused ? 'Resume' : 'Pause'}
            icon={paused ? 'play' : 'pause'}
            variant="tonal"
            size="lg"
            grow
            disabled={pending || (paused ? !controls.resume : !controls.pause)}
            hint={paused ? 'Continues the walk' : 'Pauses the belt'}
            onPress={() => {
              send(paused ? 'resume' : 'pause');
            }}
          />
        </View>
        <StopButton stopping={stopping} enabled={controls.stop} send={send} />
      </View>
      {reason === null ? null : (
        <Text variant="footnote" tone="variant" align="center">
          {reason}
        </Text>
      )}
    </View>
  );
}

export function SessionActions({ deviceId, view }: Props): ReactNode {
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  const { send } = useCommand(deviceId);
  const controls = controlsOf(view, state);
  const moving = state === 'running' || state === 'paused' || state === 'countdown';
  return moving ? (
    <RunRow
      deviceId={deviceId}
      state={state}
      controls={controls}
      reason={view.start.allowed ? null : view.start.reason}
    />
  ) : (
    <HoldStart
      enabled={controls.start.enabled}
      reason={controls.start.reason}
      onStart={() => {
        send('start');
      }}
    />
  );
}

function ModeRow({ deviceId, view }: Props): ReactNode {
  const control = useControl(deviceId, 'belt_mode');
  const mode = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.mode);
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  const controls = controlsOf(view, state);
  if (view.family !== 'wilink' || mode === null) {
    return null;
  }
  return (
    <View className="gap-1">
      <Segmented
        label="Belt mode"
        options={MODES}
        value={MODES.some((option) => option.value === mode) ? mode : 'manual'}
        disabled={!controls.mode.enabled}
        fill
        onChange={(next) => {
          background(control.set(next), 'control.set_failed');
        }}
      />
      {controls.mode.reason === null ? null : (
        <Text variant="footnote" tone="variant" align="center">
          {controls.mode.reason}
        </Text>
      )}
    </View>
  );
}

export function ControlPanels({
  deviceId,
  view,
  wide,
}: Props & { readonly wide: boolean }): ReactNode {
  return (
    <View className={wide ? 'flex-row items-start gap-4' : 'gap-4'}>
      <SpeedPanel deviceId={deviceId} view={view} />
      <InclinePanel deviceId={deviceId} view={view} />
    </View>
  );
}

export function BeltControls({ deviceId, view }: Props): ReactNode {
  return (
    <View className="gap-4">
      <SessionActions deviceId={deviceId} view={view} />
      <ControlPanels deviceId={deviceId} view={view} wide={false} />
      <ModeRow deviceId={deviceId} view={view} />
    </View>
  );
}
