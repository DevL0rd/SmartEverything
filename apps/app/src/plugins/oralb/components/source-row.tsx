import type { BrushLiveFrame, BrushStateView } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Dot } from '../../../components/badge';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { SOURCE_EXPLAIN, isLiveSource, sourceChip } from '../model/stage-model';

export function SourceRow({
  frame,
  view,
}: {
  readonly frame: BrushLiveFrame;
  readonly view: BrushStateView;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const text = sourceChip(frame, view, useMinute());
  if (text === null) {
    return null;
  }
  const source = isLiveSource(frame) ? frame.liveSource : null;
  return (
    <View className="gap-1">
      <View className="-my-2 flex-row items-center gap-1">
        <View className="min-h-6 flex-row items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-0.5">
          {source === null ? null : <Dot tone="positive" />}
          <Text variant="caption" tone="variant">
            {text}
          </Text>
        </View>
        {source === null ? null : (
          <IconButton
            icon="info"
            label={open ? 'Hide what live means' : 'What live means'}
            selected={open}
            onPress={() => {
              setOpen((now) => !now);
            }}
          />
        )}
      </View>
      {open && source !== null ? (
        <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
          {SOURCE_EXPLAIN[source]}
        </Text>
      ) : null}
    </View>
  );
}
