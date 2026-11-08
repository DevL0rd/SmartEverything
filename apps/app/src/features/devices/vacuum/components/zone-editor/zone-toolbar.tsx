import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../../components/button';
import { ProgressBar } from '../../../../../components/charts';
import { IconButton } from '../../../../../components/icon-button';
import { Segmented, type SegmentedOption } from '../../../../../components/segmented';
import { Text } from '../../../../../components/text';
import type { ColourRole } from '../../../../../design/tokens';
import { MAX_CLEAN_ZONES, MAX_RESTRICTED, type Counts, type ShapeKind } from './zone-shapes';

const MODES: readonly SegmentedOption<ShapeKind>[] = [
  { value: 'clean', label: 'Zone', spoken: 'Clean zone' },
  { value: 'no_go', label: 'No-go', spoken: 'No-go area' },
  { value: 'no_mop', label: 'No-mop', spoken: 'No-mop area' },
  { value: 'wall', label: 'Wall', spoken: 'Virtual wall' },
];

const ADD_LABEL: Readonly<Record<ShapeKind, string>> = {
  clean: 'Add clean zone',
  no_go: 'Add no-go area',
  no_mop: 'Add no-mop area',
  wall: 'Add virtual wall',
};

function Usage({
  label,
  used,
  limit,
  colour,
}: {
  readonly label: string;
  readonly used: number;
  readonly limit: number;
  readonly colour: ColourRole;
}): ReactNode {
  return (
    <View className="flex-1 gap-1">
      <Text variant="caption" tone="variant" className="tabular">
        {`${label} ${String(used)} of ${String(limit)}`}
      </Text>
      <ProgressBar progress={used / limit} colour={colour} label={`${label} used`} />
    </View>
  );
}

export interface ZoneToolbarProps {
  readonly mode: ShapeKind;
  readonly counts: Counts;
  readonly reason: string | null;
  readonly canUndo: boolean;
  readonly hasSelection: boolean;
  readonly onMode: (mode: ShapeKind) => void;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
  readonly onUndo: () => void;
}

export function ZoneToolbar(props: ZoneToolbarProps): ReactNode {
  const { mode, counts, reason, canUndo, hasSelection } = props;
  return (
    <View className="gap-3">
      <Segmented label="Draw mode" options={MODES} value={mode} onChange={props.onMode} fill />
      <View className="flex-row items-center gap-2">
        <Button
          label={ADD_LABEL[mode]}
          icon="plus"
          variant="tonal"
          size="lg"
          grow
          disabled={reason !== null}
          onPress={props.onAdd}
        />
        <IconButton
          icon="undo"
          label="Undo last edit"
          variant="tonal"
          disabled={!canUndo}
          onPress={props.onUndo}
        />
        <IconButton
          icon="trash"
          label="Remove selected"
          variant="tonal"
          tone="critical"
          disabled={!hasSelection}
          onPress={props.onRemove}
        />
      </View>
      <View className="flex-row gap-4">
        <Usage label="Zones" used={counts.clean} limit={MAX_CLEAN_ZONES} colour="primary" />
        <Usage
          label="No-go and walls"
          used={counts.restricted}
          limit={MAX_RESTRICTED}
          colour="critical"
        />
      </View>
      {reason === null ? null : (
        <Text variant="footnote" tone="warning" accessibilityLiveRegion="polite">
          {reason}
        </Text>
      )}
    </View>
  );
}
