import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { FileGlyph } from '../../../components/files/file-glyph';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useMinute } from '../../../store/clock';
import { openItemFile } from '../folder/folder-footer';
import { entryKindOf } from '../folder/folder-list';
import { quickLookCaption } from './quick-look-model';

export interface QuickLookHeaderProps {
  readonly item: DriveItem;
  readonly position: string | null;
  readonly touch: boolean;
  readonly onDetails: (() => void) | null;
  readonly onClose: () => void;
}

function FileActions({
  item,
  touch,
  onDetails,
}: {
  readonly item: DriveItem;
  readonly touch: boolean;
  readonly onDetails: (() => void) | null;
}): ReactNode {
  if (item.kind === 'folder') return null;
  return (
    <>
      {onDetails === null ? null : (
        <IconButton icon="panelRight" label="Details" shortcut="I" onPress={onDetails} />
      )}
      <IconButton
        icon="download"
        label={`Download ${item.name}`}
        onPress={() => {
          openItemFile(item, true);
        }}
      />
      {touch ? null : (
        <Button
          label="Open"
          icon="externalLink"
          variant="tonal"
          onPress={() => {
            openItemFile(item, false);
          }}
        />
      )}
    </>
  );
}

export function QuickLookHeader({
  item,
  position,
  touch,
  onDetails,
  onClose,
}: QuickLookHeaderProps): ReactNode {
  const now = useMinute();
  return (
    <View
      className={cn(
        'flex-row items-center gap-3 border-b border-outline-variant',
        touch ? 'min-h-16 px-2' : 'min-h-14 pl-4 pr-3',
      )}
    >
      {touch ? <IconButton icon="chevronLeft" label="Close quick look" onPress={onClose} /> : null}
      <FileGlyph kind={entryKindOf(item)} name={item.name} well="s" />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {quickLookCaption(item, now)}
        </Text>
      </View>
      {position === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {position}
        </Text>
      )}
      <FileActions item={item} touch={touch} onDetails={onDetails} />
      {touch ? null : (
        <IconButton icon="x" label="Close quick look" shortcut="Space" onPress={onClose} />
      )}
    </View>
  );
}
