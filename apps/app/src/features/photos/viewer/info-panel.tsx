import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { BottomSheet } from '../../../components/bottom-sheet';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { Button } from '../../../components/button';
import { openMetaEdit } from '../organise/meta/meta-request';
import { ItemSmartRows } from '../smart/item-rows';
import { DescriptionSection } from './description-section';
import { InfoActions, InfoRows, type InfoContent } from './info-rows';
import { metaCurrentOf } from './use-viewer-controls';

const INFO_DETENTS = ['full'] as const;

function MetaEntry({
  content,
  onOpened,
}: {
  readonly content: InfoContent;
  readonly onOpened?: () => void;
}): ReactNode {
  return (
    <View className="flex-row pb-2">
      <Button
        label="Edit date and location"
        icon="calendar"
        variant="tonal"
        onPress={() => {
          onOpened?.();
          openMetaEdit({ itemIds: [content.item.id], current: metaCurrentOf(content) });
        }}
      />
    </View>
  );
}

export function InfoPanel({
  content,
  onClose,
}: {
  readonly content: InfoContent;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <View className="w-90 shrink-0 border-l border-outline-variant bg-chrome">
      <View className="h-16 flex-row items-center justify-between pl-5 pr-2">
        <Text variant="title-3">Info</Text>
        <IconButton icon="close" label="Close info" onPress={onClose} shortcut="I" />
      </View>
      <ScrollView contentContainerClassName="px-5 pb-5">
        <DescriptionSection itemId={content.item.id} media={content.media} />
        <MetaEntry content={content} />
        <InfoRows content={content} />
        <ItemSmartRows itemId={content.item.id} />
        <InfoActions content={content} />
      </ScrollView>
    </View>
  );
}

export function InfoSheet({
  open,
  content,
  onClose,
}: {
  readonly open: boolean;
  readonly content: InfoContent;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Info"
      label="Photo info"
      detents={INFO_DETENTS}
      scroll
    >
      <DescriptionSection itemId={content.item.id} media={content.media} />
      <MetaEntry content={content} onOpened={onClose} />
      <InfoRows content={content} />
      <ItemSmartRows itemId={content.item.id} onOpened={onClose} />
      <InfoActions content={content} />
    </BottomSheet>
  );
}
