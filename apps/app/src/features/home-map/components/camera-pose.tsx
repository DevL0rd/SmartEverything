import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import {
  HOME_MAP_AUTO_PLACE,
  homeMapAvailablePanModes,
  homeMapCameraDefaults,
  homeMapCameraDirection,
  type HomeMapAutoFacts,
  type HomeMapCamera,
  type HomeMapCameraDirection,
  type HomeMapPanMode,
  type HomeMapPlacement,
  type HomeMapPtzState,
} from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { CAMERA_DIRECTION_UNKNOWN_TEXT } from '../../../components/house-map/overlays/model-types';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { useColourResolver } from '../../../design/colour';

export const ESTIMATED_FOV_TEXT = "Estimated: set your camera's view angle";
export const USE_CURRENT_DIRECTION_TEXT = 'Use the current direction for this preset';
export const PRESET_NOT_SET_TEXT = 'No direction saved yet';
export const LIVE_NEEDS_ANGLE_TEXT = 'Live needs a camera that reports its angle';

export const PAN_MODE_LABELS: Readonly<Record<HomeMapPanMode, string>> = {
  fixed: 'Fixed',
  presets: 'Presets',
  live: 'Live',
};

export const CAMERA_TILT_RANGE = [-90, 90] as const;
export const CAMERA_FACING_RANGE = [0, 359] as const;

export type CameraPlacement = HomeMapPlacement & { readonly camera: HomeMapCamera };

const UNKNOWN_CAMERA_FACTS: HomeMapAutoFacts = {
  mount: 'wall',
  defaultHeightM: HOME_MAP_AUTO_PLACE.cameraHeightM,
  footprint: { w: 0, d: 0, h: 0 },
};

export function posedCamera(placement: HomeMapPlacement, model: string): CameraPlacement {
  const camera =
    placement.camera ??
    homeMapCameraDefaults(() => UNKNOWN_CAMERA_FACTS, model, placement.rotation);
  return { ...placement, camera };
}

export const STILL_PTZ: HomeMapPtzState = { preset: null, live: null, moveUncertain: false };

export function cameraPtzOf(preset: unknown): HomeMapPtzState {
  return { ...STILL_PTZ, preset: typeof preset === 'string' ? preset : null };
}

export function cameraPanOptions(
  model: string,
  presets: readonly string[],
): readonly SegmentedOption<HomeMapPanMode>[] {
  return homeMapAvailablePanModes({ model, presets: presets.length > 0 }).map((mode) => ({
    value: mode,
    label: PAN_MODE_LABELS[mode],
  }));
}

export function withPanMode(camera: HomeMapCamera, mode: HomeMapPanMode): HomeMapCamera {
  return { ...camera, pan: { ...camera.pan, mode } };
}

export function withFacing(camera: HomeMapCamera, yawDeg: number): HomeMapCamera {
  return { ...camera, pan: { ...camera.pan, yawDeg } };
}

export function withCurrentForPreset(placement: CameraPlacement, preset: string): HomeMapCamera {
  const { camera } = placement;
  const stored = { yawDeg: camera.pan.yawDeg, tiltDeg: placement.tilt };
  return {
    ...camera,
    pan: { ...camera.pan, presets: { ...camera.pan.presets, [preset]: stored } },
  };
}

export type CameraFovField = 'hfovDeg' | 'vfovDeg' | 'rangeM';

export function withFov(
  camera: HomeMapCamera,
  field: CameraFovField,
  value: number,
): HomeMapCamera {
  return { ...camera, [field]: value, fovSource: 'exact' };
}

export function estimatedFovNote(camera: HomeMapCamera): string | null {
  return camera.fovSource === 'estimated' ? ESTIMATED_FOV_TEXT : null;
}

export function cameraDirectionNote(
  placement: CameraPlacement,
  ptz: HomeMapPtzState,
): string | null {
  const direction = homeMapCameraDirection(placement, ptz);
  if (direction === null || direction.known) return null;
  const preset = ptz.preset;
  const missing =
    placement.camera.pan.mode === 'presets' &&
    preset !== null &&
    placement.camera.pan.presets[preset] === undefined;
  return missing ? `No direction saved for ${preset}` : CAMERA_DIRECTION_UNKNOWN_TEXT;
}

export interface CameraPresetRow {
  readonly value: string;
  readonly current: boolean;
  readonly stored: { readonly yawDeg: number; readonly tiltDeg: number } | null;
}

export function cameraPresetRows(
  camera: HomeMapCamera,
  presets: readonly string[],
  ptz: HomeMapPtzState,
): readonly CameraPresetRow[] {
  return presets.map((value) => ({
    value,
    current: ptz.preset === value,
    stored: camera.pan.presets[value] ?? null,
  }));
}

const RAD = Math.PI / 180;
const TOP = { cx: 64, cy: 60, r: 48 } as const;
const SIDE = { cx: 150, cy: 26, r: 78, floor: 104 } as const;

const round = (value: number): string => String(Math.round(value * 100) / 100);

const pointAt = (cx: number, cy: number, r: number, deg: number): string =>
  `${round(cx + r * Math.cos(deg * RAD))} ${round(cy - r * Math.sin(deg * RAD))}`;

export function wedgePath(
  centre: { readonly cx: number; readonly cy: number; readonly r: number },
  aimDeg: number,
  spanDeg: number,
): string {
  const { cx, cy, r } = centre;
  if (spanDeg >= 360) {
    return `M ${round(cx - r)} ${round(cy)} A ${round(r)} ${round(r)} 0 1 0 ${round(cx + r)} ${round(cy)} A ${round(r)} ${round(r)} 0 1 0 ${round(cx - r)} ${round(cy)} Z`;
  }
  const half = spanDeg / 2;
  const large = spanDeg > 180 ? 1 : 0;
  const from = pointAt(cx, cy, r, aimDeg - half);
  const to = pointAt(cx, cy, r, aimDeg + half);
  return `M ${round(cx)} ${round(cy)} L ${from} A ${round(r)} ${round(r)} 0 ${String(large)} 0 ${to} Z`;
}

export interface ConePreview {
  readonly top: string;
  readonly side: string;
  readonly dashed: boolean;
  readonly spoken: string;
}

export function conePreview(camera: HomeMapCamera, direction: HomeMapCameraDirection): ConePreview {
  const facing = Math.round(direction.yawDeg);
  const tilt = Math.round(direction.tiltDeg);
  const known = direction.known ? '' : ', direction unknown';
  const tilted =
    tilt === 0 ? 'level' : `tilted ${tilt > 0 ? 'down' : 'up'} ${String(Math.abs(tilt))} degrees`;
  return {
    top: wedgePath(TOP, direction.yawDeg, camera.hfovDeg),
    side: wedgePath(SIDE, -direction.tiltDeg, camera.vfovDeg),
    dashed: !direction.known,
    spoken: `Camera view: facing ${String(facing)} degrees, ${String(Math.round(camera.hfovDeg))} degrees wide, ${tilted}${known}`,
  };
}

export const CONE_FILL_OPACITY = 0.22;

function Wedge({
  d,
  tone,
  dash,
}: {
  readonly d: string;
  readonly tone: string;
  readonly dash: string;
}): ReactNode {
  return (
    <Path
      d={d}
      fill={tone}
      fillOpacity={CONE_FILL_OPACITY}
      stroke={tone}
      strokeWidth={1.5}
      strokeDasharray={dash}
    />
  );
}

export function ConeFigure({ preview }: { readonly preview: ConePreview }): ReactNode {
  const resolve = useColourResolver();
  const tone = resolve(preview.dashed ? 'warning' : 'primary');
  const edge = resolve('outline-variant');
  const dash = preview.dashed ? '5 4' : 'none';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={preview.spoken}
      className="h-28 w-full rounded-md bg-surface-2"
    >
      <Svg width="100%" height="100%" viewBox="0 0 240 120" preserveAspectRatio="xMidYMid meet">
        <Circle cx={TOP.cx} cy={TOP.cy} r={TOP.r} fill="none" stroke={edge} strokeWidth={1} />
        <Wedge d={preview.top} tone={tone} dash={dash} />
        <Circle cx={TOP.cx} cy={TOP.cy} r={4} fill={tone} />
        <Line
          x1={SIDE.cx - 6}
          y1={SIDE.floor}
          x2={232}
          y2={SIDE.floor}
          stroke={edge}
          strokeWidth={1.5}
        />
        <Line
          x1={SIDE.cx - 6}
          y1={8}
          x2={SIDE.cx - 6}
          y2={SIDE.floor}
          stroke={edge}
          strokeWidth={1.5}
        />
        <Wedge d={preview.side} tone={tone} dash={dash} />
        <Circle cx={SIDE.cx} cy={SIDE.cy} r={4} fill={tone} />
      </Svg>
    </View>
  );
}

export interface CameraPoseProps {
  readonly placement: CameraPlacement;
  readonly model: string;
  readonly presets: readonly string[];
  readonly ptz: HomeMapPtzState;
  readonly disabled: boolean;
  readonly patch: (next: Partial<HomeMapPlacement>) => void;
}

function AimFields({ placement, disabled, patch }: CameraPoseProps): ReactNode {
  return (
    <>
      <NumberStepper
        label="Facing"
        unit="°"
        step={1}
        value={Math.round(placement.camera.pan.yawDeg)}
        min={CAMERA_FACING_RANGE[0]}
        max={CAMERA_FACING_RANGE[1]}
        disabled={disabled}
        onChange={(yawDeg): void => {
          patch({ camera: withFacing(placement.camera, yawDeg) });
        }}
      />
      <NumberStepper
        label="Tilt down"
        unit="°"
        step={1}
        value={Math.round(placement.tilt)}
        min={CAMERA_TILT_RANGE[0]}
        max={CAMERA_TILT_RANGE[1]}
        disabled={disabled}
        onChange={(tilt): void => {
          patch({ tilt });
        }}
      />
    </>
  );
}

function PresetRow({
  row,
  pose,
}: {
  readonly row: CameraPresetRow;
  readonly pose: CameraPoseProps;
}): ReactNode {
  const stored =
    row.stored === null
      ? PRESET_NOT_SET_TEXT
      : `Facing ${String(Math.round(row.stored.yawDeg))}°, tilt ${String(Math.round(row.stored.tiltDeg))}°`;
  return (
    <View className="gap-2 rounded-md border-hairline border-outline-variant p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="body-strong" numberOfLines={1}>
          {row.value}
        </Text>
        {row.current ? <Badge label="Now" tone="primary" /> : null}
      </View>
      <Text variant="footnote" tone="variant">
        {stored}
      </Text>
      <Button
        label={USE_CURRENT_DIRECTION_TEXT}
        icon="locate"
        variant="tonal"
        disabled={pose.disabled}
        onPress={(): void => {
          pose.patch({ camera: withCurrentForPreset(pose.placement, row.value) });
        }}
      />
    </View>
  );
}

function PresetList(props: CameraPoseProps): ReactNode {
  const rows = cameraPresetRows(props.placement.camera, props.presets, props.ptz);
  return (
    <View accessibilityLabel="Presets" className="gap-2">
      {rows.map((row) => (
        <PresetRow key={row.value} row={row} pose={props} />
      ))}
    </View>
  );
}

const FOV_FIELDS: readonly {
  readonly field: CameraFovField;
  readonly label: string;
  readonly unit: string;
  readonly step: number;
  readonly min: number;
  readonly max: number;
}[] = [
  { field: 'hfovDeg', label: 'Width', unit: '°', step: 1, min: 1, max: 360 },
  { field: 'vfovDeg', label: 'Height', unit: '°', step: 1, min: 1, max: 360 },
  { field: 'rangeM', label: 'Reach', unit: 'm', step: 0.5, min: 0.5, max: Number.MAX_SAFE_INTEGER },
];

function FovFields(props: CameraPoseProps): ReactNode {
  const { camera } = props.placement;
  const note = estimatedFovNote(camera);
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="caption" tone="variant">
          View angle
        </Text>
        {note === null ? null : <Badge label={note} tone="warning" icon="info" />}
      </View>
      {FOV_FIELDS.map((spec) => (
        <NumberStepper
          key={spec.field}
          label={spec.label}
          unit={spec.unit}
          step={spec.step}
          value={spec.field === 'rangeM' ? camera.rangeM : Math.round(camera[spec.field])}
          min={spec.min}
          max={spec.max}
          disabled={props.disabled}
          onChange={(value): void => {
            props.patch({ camera: withFov(camera, spec.field, value) });
          }}
        />
      ))}
    </View>
  );
}

export function CameraPose(props: CameraPoseProps): ReactNode {
  const { placement, model, presets, ptz, disabled, patch } = props;
  const { camera } = placement;
  const direction = homeMapCameraDirection(placement, ptz);
  const note = cameraDirectionNote(placement, ptz);
  const options = cameraPanOptions(model, presets);
  return (
    <View accessibilityLabel="Camera view" className="gap-3">
      {direction === null ? null : <ConeFigure preview={conePreview(camera, direction)} />}
      {note === null ? null : <Badge label={note} tone="warning" icon="warning" />}
      {options.length > 1 ? (
        <Segmented
          label="Pan"
          fill
          options={options}
          value={camera.pan.mode}
          disabled={disabled}
          onChange={(mode): void => {
            patch({ camera: withPanMode(camera, mode) });
          }}
        />
      ) : null}
      {options.length > 1 && !options.some((option) => option.value === 'live') ? (
        <Text variant="caption" tone="variant">
          {LIVE_NEEDS_ANGLE_TEXT}
        </Text>
      ) : null}
      <AimFields {...props} />
      {camera.pan.mode === 'presets' ? <PresetList {...props} /> : null}
      <FovFields {...props} />
      <Switch
        label="Show in all camera views"
        value={camera.showCone}
        disabled={disabled}
        onChange={(showCone): void => {
          patch({ camera: { ...camera, showCone } });
        }}
      />
    </View>
  );
}
