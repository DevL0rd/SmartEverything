import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoSource } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { SOURCE_COPY } from './source-copy';
import { pickedDetail, pickedLine, type SourceTile } from './source-model';

export interface SourceSelectionProps {
  readonly source: PhotoSource;
  readonly picked: readonly SourceTile[];
  readonly disabled: boolean;
  readonly chatHint: string | null;
  readonly onClear: () => void;
  readonly onKeep: () => void;
  readonly onChat: () => void;
}

function Picked({
  source,
  picked,
}: {
  readonly source: PhotoSource;
  readonly picked: readonly SourceTile[];
}): ReactNode {
  const detail = pickedDetail(source, picked);
  return (
    <View className="min-w-0 flex-1 flex-row items-baseline gap-1.5">
      <Text variant="title-3" tone="onPrimaryContainer" className="tabular-nums" numberOfLines={1}>
        {pickedLine(source, picked.length)}
      </Text>
      {detail === null ? null : (
        <Text
          variant="footnote"
          tone="onPrimaryContainer"
          className="tabular-nums"
          numberOfLines={1}
        >
          {`· ${detail}`}
        </Text>
      )}
    </View>
  );
}

export function SourceSelection(props: SourceSelectionProps): ReactNode {
  const { source, picked, disabled, chatHint } = props;
  const off = disabled || picked.length === 0;
  return (
    <View className="min-h-15 flex-row flex-wrap items-center gap-2 bg-primary-container px-gutter py-2">
      <IconButton
        icon="close"
        label="Clear the selection"
        tone="onPrimaryContainer"
        onPress={props.onClear}
      />
      <Picked source={source} picked={picked} />
      {source === 'cameras' ? (
        <Button
          label="To chat"
          icon="messageCircle"
          variant="outlined"
          disabled={off || chatHint !== null}
          onPress={props.onChat}
        />
      ) : null}
      <Button
        label={SOURCE_COPY[source].keepLabel}
        icon={source === 'cameras' ? 'folder' : 'check'}
        variant="tonal"
        disabled={off || picked.every((tile) => tile.kept)}
        onPress={props.onKeep}
      />
    </View>
  );
}
