import type { ReactNode } from 'react';
import { memo } from 'react';
import type { FileEntry } from '@smarteverything/domain';
import { EntryRow } from '../../../components/files/entry-row';
import type { MenuItem } from '../../../components/menu';
import { entryLine } from './path-model';
import type { RowAction } from './file-model';

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

export const FileRowView = memo(function FileRowView({
  entry,
  wide,
  canAttach,
  detail,
  selecting,
  selected,
  onAction,
}: FileRowProps): ReactNode {
  const opening = `${entry.kind === 'folder' ? 'Open folder' : 'Preview'} ${entry.name}`;
  return (
    <EntryRow
      name={entry.name}
      kind={entry.kind}
      caption={captionOf(entry, wide, detail)}
      size={entry.kind === 'folder' ? null : entry.size}
      modifiedAt={entry.modifiedAt}
      wide={wide}
      selecting={selecting}
      selected={selected}
      openLabel={opening}
      menu={menuOf(entry, canAttach, onAction)}
      onOpen={() => {
        onAction('open', entry);
      }}
      onSelect={() => {
        onAction('select', entry);
      }}
    />
  );
});
