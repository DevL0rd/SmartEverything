import type { ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Icon } from '../../../../components/icon';
import type { IconName } from '../../../../components/icon-glyphs';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { Segmented, type SegmentedOption } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { atLeast, useSizeClass } from '../../../../design/size-class';
import type { CameraPresetId } from '../../../../components/house-map/3d/render-core-orbit';

type OnLayout = ((event: LayoutChangeEvent) => void) | undefined;

const PILL_FRAME = 'rounded-full border-hairline border-outline-variant bg-surface-raised';

export interface StagePill {
  readonly text: string;
  readonly tone: 'working' | 'paused' | 'returning' | 'idle' | 'error';
}

const DOT: Readonly<Record<StagePill['tone'], string>> = {
  working: 'bg-primary',
  paused: 'bg-warning',
  returning: 'bg-info',
  idle: 'bg-on-surface-variant',
  error: 'bg-critical',
};

export function StatusPill({ pill }: { readonly pill: StagePill }): ReactNode {
  return (
    <View
      pointerEvents="none"
      accessibilityRole="summary"
      className={cn('min-h-touch-min max-w-full flex-row items-center gap-2 px-3', PILL_FRAME)}
    >
      <View className={cn('size-2 rounded-full', DOT[pill.tone])} />
      <Text variant="caption" numberOfLines={1} className="shrink">
        {pill.text}
      </Text>
    </View>
  );
}

export type StageViewOption<V extends string> = SegmentedOption<V>;

export function ViewSwitcher<V extends string>({
  views,
  value,
  onChange,
  onLayout,
}: {
  readonly views: readonly StageViewOption<V>[];
  readonly value: V;
  readonly onChange: (view: V) => void;
  readonly onLayout?: OnLayout;
}): ReactNode {
  if (views.length < 2) {
    return null;
  }
  return (
    <View onLayout={onLayout} className={PILL_FRAME}>
      <Segmented size="control" label="View" value={value} onChange={onChange} options={views} />
    </View>
  );
}

export interface StageFloor {
  readonly id: string;
  readonly label: string;
  readonly spoken?: string;
}

export interface StageFloors {
  readonly options: readonly StageFloor[];
  readonly value: string;
  readonly onChange: (floorId: string) => void;
}

export function floorsShown(floors: StageFloors | undefined): floors is StageFloors {
  return floors !== undefined && floors.options.length > 1;
}

export const SWITCHER_ROW =
  'max-w-full flex-row items-center rounded-full border-hairline bg-surface-raised';

export function SwitcherLead({
  icon,
  text,
}: {
  readonly icon: IconName;
  readonly text: string;
}): ReactNode {
  const { width } = useSizeClass();
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-center gap-1.5 pl-3 pr-1"
    >
      <Icon name={icon} size={16} tone="variant" />
      {atLeast(width, 'medium') ? (
        <Text variant="label" tone="variant" numberOfLines={1}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

export function FloorSwitcher({
  floors,
  onLayout,
}: {
  readonly floors: StageFloors | undefined;
  readonly onLayout?: OnLayout;
}): ReactNode {
  if (!floorsShown(floors)) {
    return null;
  }
  return (
    <View
      onLayout={onLayout}
      className={cn('mr-auto self-start border-dashed border-outline', SWITCHER_ROW)}
    >
      <SwitcherLead icon="layers" text="Floor" />
      <Segmented
        size="control"
        label="Floor"
        value={floors.value}
        onChange={floors.onChange}
        options={floors.options.map((floor) => ({
          value: floor.id,
          label: floor.label,
          spoken: floor.spoken ?? floor.label,
        }))}
      />
    </View>
  );
}

export interface StageNotice {
  readonly icon: IconName;
  readonly text: string;
  readonly onPress?: (() => void) | undefined;
}

export function NoticeChip({
  notice,
  onLayout,
}: {
  readonly notice: StageNotice;
  readonly onLayout?: OnLayout;
}): ReactNode {
  const body = (
    <>
      <Icon name={notice.icon} size={16} tone="primary" />
      <Text variant="caption" numberOfLines={1} className="shrink">
        {notice.text}
      </Text>
    </>
  );
  const frame = cn('min-h-touch-min max-w-full flex-row items-center gap-2 px-3', PILL_FRAME);
  return (
    <View onLayout={onLayout} pointerEvents="box-none" className="shrink self-start">
      {notice.onPress === undefined ? (
        <View accessibilityRole="summary" className={frame}>
          {body}
        </View>
      ) : (
        <Interactive role="button" label={notice.text} onPress={notice.onPress} className={frame}>
          {body}
        </Interactive>
      )}
    </View>
  );
}

const PRESETS = [
  { value: 'angled', label: '3D', spoken: '3D view' },
  { value: 'top', label: 'Top', spoken: 'View from the top' },
] as const satisfies readonly SegmentedOption<CameraPresetId>[];

export interface StageToggle {
  readonly on: boolean;
  readonly onToggle: () => void;
}

export interface StageToolsProps {
  readonly tools3d: boolean;
  readonly preset: CameraPresetId;
  readonly onPreset: (preset: CameraPresetId) => void;
  readonly follow: StageToggle | undefined;
  readonly lights: StageToggle | undefined;
  readonly onFit: () => void;
  readonly onLocate: (() => void) | undefined;
  readonly onFullScreen: (() => void) | undefined;
  readonly onEdit: (() => void) | undefined;
  readonly onLayout?: OnLayout;
}

function Tools3d(props: StageToolsProps): ReactNode {
  const { width } = useSizeClass();
  const { follow } = props;
  const roomy = atLeast(width, 'medium');
  return (
    <>
      <View className={cn(!roomy && 'min-w-28', PILL_FRAME)}>
        <Segmented
          size="control"
          fill={!roomy}
          label="Camera angle"
          value={props.preset}
          onChange={props.onPreset}
          options={PRESETS}
        />
      </View>
      {follow === undefined ? null : (
        <IconButton
          icon="locate"
          label="Follow the robot"
          variant="raised"
          size="control"
          selected={follow.on}
          onPress={follow.onToggle}
        />
      )}
      <IconButton icon="focus" label="Fit" variant="raised" size="control" onPress={props.onFit} />
    </>
  );
}

function Action({
  icon,
  label,
  onPress,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: (() => void) | undefined;
}): ReactNode {
  return onPress === undefined ? null : (
    <IconButton icon={icon} label={label} variant="raised" size="control" onPress={onPress} />
  );
}

export function StageTools(props: StageToolsProps): ReactNode {
  const { lights } = props;
  return (
    <View
      pointerEvents="box-none"
      onLayout={props.onLayout}
      className="flex-row flex-wrap items-center justify-end gap-2"
    >
      {lights === undefined ? null : (
        <IconButton
          icon="bulb"
          label="Lights"
          variant="raised"
          size="control"
          selected={lights.on}
          onPress={lights.onToggle}
        />
      )}
      {props.tools3d ? <Tools3d {...props} /> : null}
      <Action icon="volume" label="Sound" onPress={props.onLocate} />
      <Action icon="maximize" label="Full screen" onPress={props.onFullScreen} />
      <Action icon="pencil" label="Edit map" onPress={props.onEdit} />
    </View>
  );
}
