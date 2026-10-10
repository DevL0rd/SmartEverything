import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { Slider } from '../../../components/slider';
import { cn } from '../../../design/cn';
import { PtzPad, type PadSize } from './ptz-pad';
import type { CameraZoom } from './use-camera-zoom';
import type { Ptz } from './use-ptz';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, type Zoom } from './use-zoom';
import { times } from '../../../format/number';

const CAMERA_ZOOM_NUDGE = 0.5;

function nudged(camera: CameraZoom, by: number): number {
  return Math.min(camera.max, Math.max(camera.min, camera.level + by));
}

function CameraZoomControls({ camera }: { readonly camera: CameraZoom }): ReactNode {
  const touch = useIdiom() === 'touch';
  return (
    <View className="max-h-full w-12 shrink items-center rounded-full bg-black/40 py-1">
      <Interactive
        label="Zoom back to 1×"
        disabled={camera.level <= camera.min}
        onPress={camera.reset}
        className={cn(
          'items-center justify-center rounded-full',
          touch ? 'min-h-touch-min min-w-touch-min' : 'min-h-8 min-w-8',
        )}
        layerClassName="rounded-full"
      >
        <Text variant="caption">{times(camera.level)}</Text>
      </Interactive>
      <IconButton
        icon="plus"
        label="Zoom in"
        variant="overlay"
        onPress={() => {
          if (camera.level < camera.max) {
            camera.commit(nudged(camera, CAMERA_ZOOM_NUDGE));
          }
        }}
      />
      <Slider
        label="Camera zoom"
        orientation="vertical"
        value={camera.level}
        min={camera.min}
        max={camera.max}
        step={camera.step}
        formatValue={times}
        onChange={camera.preview}
        onCommit={camera.commit}
      />
      <IconButton
        icon="minus"
        label="Zoom out"
        variant="overlay"
        onPress={() => {
          if (camera.level > camera.min) {
            camera.commit(nudged(camera, -CAMERA_ZOOM_NUDGE));
          }
        }}
      />
    </View>
  );
}

function DigitalZoomControls({ zoom }: { readonly zoom: Zoom }): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const zoomed = zoom.view.zoom > 1;
  if (!pointer && !zoomed) {
    return null;
  }
  return (
    <View className="items-center gap-1 rounded-full bg-black/40 p-1">
      {pointer ? (
        <IconButton
          icon="plus"
          label="Zoom in"
          variant="overlay"
          disabled={zoom.view.zoom >= ZOOM_MAX}
          onPress={() => {
            zoom.zoomBy(ZOOM_STEP);
          }}
        />
      ) : null}
      <Interactive
        label="Reset zoom"
        disabled={!zoomed}
        onPress={zoom.reset}
        className="min-h-touch-min min-w-touch-min items-center justify-center rounded-full px-2"
        layerClassName="rounded-full"
      >
        <Text variant="label">{times(zoom.view.zoom)}</Text>
      </Interactive>
      {pointer ? (
        <IconButton
          icon="minus"
          label="Zoom out"
          variant="overlay"
          disabled={zoom.view.zoom <= ZOOM_MIN}
          onPress={() => {
            zoom.zoomBy(-ZOOM_STEP);
          }}
        />
      ) : null}
    </View>
  );
}

const VIDEO_ASPECT = 16 / 9;
const CLEAR_TOP = 64;
const CLEAR_BOTTOM = 80;

interface Band {
  readonly top: number;
  readonly bottom: number;
}

const NO_BAND: Band = { top: CLEAR_TOP, bottom: CLEAR_BOTTOM };

function bandOf(width: number, height: number): Band {
  const gap = Math.max(0, (height - width / VIDEO_ASPECT) / 2);
  return { top: Math.max(CLEAR_TOP, gap), bottom: Math.max(CLEAR_BOTTOM, gap) };
}

export function SideControls({
  ptz,
  zoom,
  camera,
  size,
  live,
}: {
  readonly ptz: Ptz;
  readonly zoom: Zoom;
  readonly camera: CameraZoom;
  readonly size: PadSize;
  readonly live: boolean;
}): ReactNode {
  const [band, setBand] = useState<Band>(NO_BAND);
  if (!live) {
    return null;
  }
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-0"
      onLayout={(event) => {
        setBand(bandOf(event.nativeEvent.layout.width, event.nativeEvent.layout.height));
      }}
    >
      <View pointerEvents="box-none" style={band} className="absolute left-2 justify-center">
        {camera.supported ? (
          <CameraZoomControls camera={camera} />
        ) : (
          <DigitalZoomControls zoom={zoom} />
        )}
      </View>
      <View pointerEvents="box-none" style={band} className="absolute right-2 justify-center">
        <PtzPad ptz={ptz} size={size} />
      </View>
    </View>
  );
}
