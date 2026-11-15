import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Logger } from '@smarteverything/logging';
import { Text } from '../../../components/text';
import { Zoomable } from '../../../components/zoomable';
import { bytes } from '../../../format/number';
import type { TextHead } from './text-head';

const log = new Logger('app.files');

export function PictureAt({
  uri,
  placeholder,
  recyclingKey,
  label,
  onZoomed,
}: {
  readonly uri: string | null;
  readonly placeholder: string | null;
  readonly recyclingKey: string;
  readonly label: string;
  readonly onZoomed?: (zoomed: boolean) => void;
}): ReactNode {
  return (
    <Zoomable
      className="size-full overflow-hidden"
      {...(onZoomed === undefined ? {} : { onZoomed })}
    >
      <Image
        source={uri === null ? null : { uri }}
        placeholder={placeholder === null ? null : { uri: placeholder }}
        placeholderContentFit="contain"
        contentFit="contain"
        cachePolicy="disk"
        recyclingKey={recyclingKey}
        onError={(event) => {
          log.warn('quick_look.image_failed', { reason: event.error });
        }}
        style={StyleSheet.absoluteFill}
        accessibilityLabel={label}
      />
    </Zoomable>
  );
}

function headNote(head: TextHead, total: number): string | null {
  if (!head.partial) return null;
  return `Showing the first ${bytes(head.shownBytes)} of ${bytes(total)}. Open the file to read the rest.`;
}

export function TextLines({
  head,
  total,
  selectable,
}: {
  readonly head: TextHead;
  readonly total: number;
  readonly selectable: boolean;
}): ReactNode {
  const lines = useMemo(() => head.text.split('\n'), [head.text]);
  const note = headNote(head, total);
  return (
    <View className="size-full min-h-0 gap-2 p-4">
      <View className="min-h-0 flex-1 rounded-md border-hairline border-outline-variant bg-surface-1">
        <FlashList
          data={lines}
          keyExtractor={(_line, index) => String(index)}
          ListHeaderComponent={<View className="h-3" />}
          ListFooterComponent={<View className="h-3" />}
          renderItem={({ item }) => (
            <Text selectable={selectable} className="px-4 font-mono text-footnote">
              {item === '' ? ' ' : item}
            </Text>
          )}
        />
      </View>
      {note === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {note}
        </Text>
      )}
    </View>
  );
}
