import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../../components/icon-button';
import type { ViewportCommand } from '../canvas/viewport';

export type ViewportKind = ViewportCommand['type'];

export interface CanvasControlsProps {
  readonly touch: boolean;
  readonly onCommand: (type: ViewportKind) => void;
}

export const CanvasControls = memo(function CanvasControls({
  touch,
  onCommand,
}: CanvasControlsProps): ReactNode {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Canvas view"
      pointerEvents="box-none"
      className={
        touch
          ? 'absolute right-2 top-2 rounded-full border border-outline-variant bg-surface-1'
          : 'items-center gap-1 border-l border-outline-variant bg-surface-1 p-1'
      }
    >
      {touch ? null : (
        <IconButton
          icon="plus"
          label="Zoom in"
          shortcut="+"
          tooltip="left"
          onPress={() => {
            onCommand('zoomIn');
          }}
        />
      )}
      {touch ? null : (
        <IconButton
          icon="minus"
          label="Zoom out"
          shortcut="-"
          tooltip="left"
          onPress={() => {
            onCommand('zoomOut');
          }}
        />
      )}
      <IconButton
        icon="maximize"
        label="Fit to view"
        shortcut="F"
        tooltip="left"
        onPress={() => {
          onCommand('fit');
        }}
      />
    </View>
  );
});
