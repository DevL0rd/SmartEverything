import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import type { FileEntry } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { shortDate } from '../../../format/time';
import { entryLine } from './path-model';
import { glyphOf, type RowAction } from './file-model';

export interface FileRowProps {
  readonly entry: FileEntry;
  readonly wide: boolean;
  readonly canAttach: boolean;
  readonly detail: string | null;
  readonly selecting: boolean;
  readonly selected: boolean;
  readonly onAction: (action: RowAction, entry: FileEntry) => void;
}

function menuOf(
  entry: FileEntry,
  canAttach: boolean,
  onAction: FileRowProps['onAction'],
): readonly MenuItem[] {
  const item = (label: string, icon: MenuItem['icon'], action: RowAction): MenuItem => ({
    label,
    ...(icon === undefined ? {} : { icon }),
    onPress: (): void => {
      onAction(action, entry);
    },
  });
  return [
    item('Open', 'folder', 'open'),
    {
      ...item(entry.kind === 'folder' ? 'Download as zip' : 'Download', 'download', 'download'),
      disabled: entry.kind === 'other',
    },
    ...(entry.kind === 'file'
      ? [{ ...item('Attach to chat', 'paperclip', 'attach'), disabled: !canAttach }]
      : []),
    item('Rename', 'pencil', 'rename'),
    item('Move to…', 'move', 'move'),
    item('Copy to…', 'copy', 'copy'),
    item('Select', 'circleCheck', 'select'),
    item('Properties', 'info', 'properties'),
    { ...item('Move to Trash', 'trash', 'trash'), destructive: true },
  ];
}

function captionOf(entry: FileEntry, wide: boolean, detail: string | null): string | null {
  if (wide) return detail;
  return detail === null ? entryLine(entry) : `${detail} · ${entryLine(entry)}`;
}

function Leading({
  entry,
  selecting,
  selected,
}: Pick<FileRowProps, 'entry' | 'selecting' | 'selected'>): ReactNode {
  if (selecting) {
    return (
      <Icon
        name={selected ? 'circleCheck' : 'circle'}
        size={20}
        tone={selected ? 'primary' : 'faint'}
      />
    );
  }
  return (
    <Icon name={glyphOf(entry)} size={20} tone={entry.kind === 'folder' ? 'primary' : 'variant'} />
  );
}

function Cells({
  entry,
  wide,
  detail,
  selecting,
  selected,
}: Pick<FileRowProps, 'entry' | 'wide' | 'detail' | 'selecting' | 'selected'>): ReactNode {
  const folder = entry.kind === 'folder';
  const caption = captionOf(entry, wide, detail);
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-3">
      <Leading entry={entry} selecting={selecting} selected={selected} />
      <View className="min-w-0 flex-1">
        <Text variant="callout" numberOfLines={1}>
          {entry.name}
        </Text>
        {caption === null ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {caption}
          </Text>
        )}
      </View>
      {wide ? (
        <>
          <Text variant="callout" tone="variant" align="end" className="tabular w-21">
            {folder ? '—' : bytes(entry.size)}
          </Text>
          <Text variant="callout" tone="variant" align="end" className="tabular w-22">
            {shortDate(entry.modifiedAt)}
          </Text>
        </>
      ) : null}
    </View>
  );
}

export const FileRowView = memo(function FileRowView({
  entry,
  wide,
  canAttach,
  detail,
  selecting,
  selected,
  onAction,
}: FileRowProps): ReactNode {
  const folder = entry.kind === 'folder';
  const opening = `${folder ? 'Open folder' : 'Preview'} ${entry.name}`;
  return (
    <View className="h-14 flex-row items-center border-t border-outline-variant pl-4 pr-1">
      <Interactive
        label={selecting ? `Select ${entry.name}` : opening}
        selected={selecting ? selected : undefined}
        onPress={() => {
          onAction(selecting ? 'select' : 'open', entry);
        }}
        onLongPress={() => {
          onAction('select', entry);
        }}
        className="min-w-0 flex-1 flex-row items-center self-stretch"
      >
        <Cells
          entry={entry}
          wide={wide}
          detail={detail}
          selecting={selecting}
          selected={selected}
        />
      </Interactive>
      <OverflowButton
        items={menuOf(entry, canAttach, onAction)}
        label={`Actions for ${entry.name}`}
      />
    </View>
  );
});
