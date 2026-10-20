import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../../components/icon-button';
import type { ViewportCommand } from '../../model/canvas/contract';

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
      className="absolute right-3 top-3 items-center gap-1 rounded-full border border-outline-variant bg-surface-raised p-1 elevation-2"
    >
      {touch ? null : (
        <IconButton
          icon="plus"
          label="Zoom in"
          shortcut="+"
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
          onPress={() => {
            onCommand('zoomOut');
          }}
        />
      )}
      <IconButton
        icon="maximize"
        label="Fit to screen"
        shortcut="F"
        onPress={() => {
          onCommand('fit');
        }}
      />
    </View>
  );
});
