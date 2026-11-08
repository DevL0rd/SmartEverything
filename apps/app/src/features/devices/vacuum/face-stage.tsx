import { useId, type ReactNode } from 'react';
import { View } from 'react-native';
import { ProgressBar } from '../../../components/charts';
import { IsoStill } from '../../../components/house-map/iso/iso-still';
import { StageHost } from '../../../components/house-map/live-visibility/stage-host';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import { WIDE_VISUAL_PX, type WideClass } from '../card/wide-card';
import { MapView } from './components/map-view';
import { parseMapVersion } from './data/map-feed';
import type { FaceMount } from './face-model';
import { useVacuumScene } from './data/scene-query';
import { useVacuum } from './data/use-vacuum';
import { useVacuumFault } from './data/use-vacuum-fault';
import { useVacuumPose } from './data/use-vacuum-pose';
import { readingOf, valueOrNull } from './model/readings';
import { vacuumFloor, vacuumRenderPose } from './model/vacuum-scene';

export type StageSlot = 'm' | 'w' | 'stack' | 'side';

const SLOT_FRAMES: Readonly<Record<StageSlot, string>> = {
  m: 'w-2/5 min-w-27 max-w-45 self-stretch',
  w: 'w-62 self-stretch',
  stack: 'min-h-0 w-full flex-1',
  side: 'min-w-0 flex-1 self-stretch',
};

const REST_CLASS: Readonly<Record<StageSlot, WideClass>> = {
  m: 'm',
  w: 'w',
  stack: 'xl',
  side: 'xl',
};

function restBox(slot: StageSlot): { readonly width: number; readonly height: number } {
  const px = WIDE_VISUAL_PX[REST_CLASS[slot]];
  return { width: px, height: px };
}

const FAULT = { title: 'The robot needs help', hint: null, canHelp: false } as const;

export function StageFrame({
  slot,
  resting,
  progress,
  tone,
  children,
}: {
  readonly slot: StageSlot;
  readonly resting: boolean;
  readonly progress: number | null;
  readonly tone: 'primary' | 'warning';
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      style={resting ? restBox(slot) : undefined}
      className={cn(
        'overflow-hidden rounded-lg bg-surface-3',
        resting ? 'shrink-0 self-start' : SLOT_FRAMES[slot],
      )}
    >
      {children}
      {progress === null ? null : (
        <View pointerEvents="none" className="absolute inset-x-0 bottom-0">
          <ProgressBar progress={progress} colour={tone} label="Progress" />
        </View>
      )}
    </View>
  );
}

export function RestStage({
  device,
  slot,
}: {
  readonly device: Device;
  readonly slot: StageSlot;
}): ReactNode {
  return (
    <View pointerEvents="none" className="flex-1 items-center justify-center">
      <DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[REST_CLASS[slot]]} />
    </View>
  );
}

function CameraChip({ onPress }: { readonly onPress: () => void }): ReactNode {
  return (
    <Interactive
      label="Tap for live view"
      role="button"
      onPress={onPress}
      className="absolute bottom-2 left-2 min-h-touch-min flex-row items-center gap-1.5 rounded-full bg-surface-raised/90 px-3"
    >
      <Icon name="camera" size={16} />
      <Text variant="footnote">Live view</Text>
    </Interactive>
  );
}

export interface AwakeStageProps {
  readonly device: Device;
  readonly slot: StageSlot;
  readonly view: FaceMount;
  readonly cameraLive: boolean;
  readonly cameraOffered: boolean;
  readonly error: boolean;
  readonly onCamera: () => void;
  readonly onCameraClosed: () => void;
}

export function FaceStill({ device }: { readonly device: Device }): ReactNode {
  const { snapshot } = useVacuum(device);
  const map = valueOrNull(readingOf(() => parseMapVersion(snapshot.mapVersionText)));
  const { scene } = useVacuumScene(device.id, map);
  const pose = valueOrNull(useVacuumPose(device.id));
  if (scene === null) {
    return <View className="flex-1 bg-surface-2" />;
  }
  return (
    <IsoStill
      input={{ floor: vacuumFloor(scene), robot: vacuumRenderPose(pose ?? scene.robot) }}
      name={scene.name}
      fill
    />
  );
}

export function AwakeStage(props: AwakeStageProps): ReactNode {
  if (props.view === 'still') {
    return (
      <View pointerEvents="none" className="flex-1">
        <FaceStill device={props.device} />
      </View>
    );
  }
  return <LiveStage {...props} />;
}

function LiveStage(props: AwakeStageProps): ReactNode {
  const { device, cameraLive, cameraOffered, error, onCamera } = props;
  const chip = cameraOffered && !cameraLive;
  const fault = useVacuumFault(device.id);
  const stageId = `vacuum-face:${device.id}:${useId()}`;
  return (
    <View className="flex-1">
      <StageHost
        id={stageId}
        still={<FaceStill device={device} />}
        renderLive={(live) => (
          <MapView
            key={cameraLive ? 'camera' : '3d'}
            device={device}
            variant="face"
            reserveBottom={chip}
            initialView={cameraLive ? 'camera' : '3d'}
            onViewChange={(next): void => {
              if (next !== 'camera') props.onCameraClosed();
            }}
            onReady={live.onReady}
            onUnavailable={live.onUnavailable}
            fault={error ? (fault ?? FAULT) : null}
          />
        )}
      />
      {chip ? <CameraChip onPress={onCamera} /> : null}
    </View>
  );
}
