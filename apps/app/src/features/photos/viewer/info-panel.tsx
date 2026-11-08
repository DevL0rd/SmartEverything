import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { BottomSheet } from '../../../components/bottom-sheet';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { InfoRows, type InfoContent } from './info-rows';

const INFO_DETENTS = ['full'] as const;

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
        <InfoRows content={content} />
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
      <InfoRows content={content} />
    </BottomSheet>
  );
}
