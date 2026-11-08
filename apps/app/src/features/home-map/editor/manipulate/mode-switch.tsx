import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../../components/icon';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { selectionTick } from '../../../../platform/haptics';
import type { GizmoMode, GizmoSpace } from '../tool-state';

export const MODE_SWITCH_LABEL = 'Gizmo mode';

export const WORLD_TAG = 'World';

export const SNAP_LABEL = 'Snapping';

interface ModeInfo {
  readonly label: string;
  readonly icon: IconName;
}

export const MODE_INFO: Readonly<Record<GizmoMode, ModeInfo>> = {
  move: { label: 'Move', icon: 'move' },
  rotate: { label: 'Rotate', icon: 'refresh' },
  scale: { label: 'Scale', icon: 'maximize' },
};

const MODES: readonly GizmoMode[] = ['move', 'rotate', 'scale'];

export type ModeSwitchLook = 'bar' | 'row';

export interface ModeSwitchProps {
  readonly mode: GizmoMode;
  readonly modes: readonly GizmoMode[];
  readonly space: GizmoSpace;
  readonly look: ModeSwitchLook;
  readonly onMode: (mode: GizmoMode) => void;
}

export function axesLabel(space: GizmoSpace): string {
  return space === 'world' ? 'Axes: World' : 'Axes: Local';
}

function WorldTag(): ReactNode {
  return (
    <View className="rounded-xs bg-primary px-1.5">
      <Text variant="caption" tone="onPrimary" numberOfLines={1}>
        {WORLD_TAG}
      </Text>
    </View>
  );
}

interface SegmentProps {
  readonly mode: GizmoMode;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly world: boolean;
  readonly look: ModeSwitchLook;
  readonly onPress: () => void;
}

function Segment({ mode, selected, disabled, world, look, onPress }: SegmentProps): ReactNode {
  const info = MODE_INFO[mode];
  const spoken = world ? `${info.label}, world axes` : info.label;
  return (
    <Interactive
      role="radio"
      label={spoken}
      selected={selected}
      checked={selected}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-w-0 flex-1 items-center justify-center rounded-sm border',
        look === 'bar' ? 'h-12.5 gap-0.5' : 'h-11 flex-row gap-1.5 px-2',
        selected ? 'border-primary bg-primary-container' : 'border-transparent',
      )}
      layerClassName="rounded-sm"
    >
      {world ? (
        <WorldTag />
      ) : (
        <Icon name={info.icon} size={20} tone={selected ? 'primary' : 'variant'} />
      )}
      <Text variant="caption" tone="default" numberOfLines={1}>
        {info.label}
      </Text>
    </Interactive>
  );
}

export function ModeSwitch({ mode, modes, space, look, onMode }: ModeSwitchProps): ReactNode {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={MODE_SWITCH_LABEL}
      className="min-w-0 flex-1 flex-row gap-0.5 rounded-md border-hairline border-outline-variant p-0.5"
    >
      {MODES.map((each) => (
        <Segment
          key={each}
          mode={each}
          look={look}
          selected={each === mode}
          disabled={!modes.includes(each)}
          world={each === 'move' && space === 'world'}
          onPress={(): void => {
            if (each === mode) return;
            selectionTick();
            onMode(each);
          }}
        />
      ))}
    </View>
  );
}

export interface ToggleProps {
  readonly on: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
}

export function SnapToggle({ on, disabled, onToggle }: ToggleProps): ReactNode {
  return (
    <IconButton
      icon="grid"
      label={SNAP_LABEL}
      shortcut="S"
      selected={on}
      disabled={disabled}
      onPress={onToggle}
    />
  );
}

export interface AxesToggleProps {
  readonly space: GizmoSpace;
  readonly disabled: boolean;
  readonly onToggle: () => void;
}

export function AxesToggle({ space, disabled, onToggle }: AxesToggleProps): ReactNode {
  return (
    <IconButton
      icon={space === 'world' ? 'globe' : 'box'}
      label={axesLabel(space)}
      shortcut="X"
      selected={space === 'world'}
      disabled={disabled}
      onPress={onToggle}
    />
  );
}
