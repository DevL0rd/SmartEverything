import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Arc } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { boxStyle } from '../../shared/medallion-model';
import { ringShare } from './completion';
import type { FolderState } from './folder-model';

const THICKNESS = 3;
const GLYPH_FROM = 28;

export type FolderRingSize = 20 | 28 | 40;

export function FolderRing({
  state,
  size,
  label,
}: {
  readonly state: FolderState;
  readonly size: FolderRingSize;
  readonly label: string;
}): ReactNode {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={boxStyle(size)}
      className="shrink-0 items-center justify-center"
    >
      <Arc
        value={ringShare(state.percent)}
        size={size}
        thickness={THICKNESS}
        colour={state.tone}
        trackColour="surface-3"
      />
      {state.glyph === null || size < GLYPH_FROM ? null : (
        <View aria-hidden className="absolute inset-0 items-center justify-center">
          <Icon name={state.glyph} size={size === 40 ? 20 : 16} tone={state.tone} />
        </View>
      )}
    </View>
  );
}
