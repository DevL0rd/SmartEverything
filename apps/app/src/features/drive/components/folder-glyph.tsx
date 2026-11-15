import type { ReactNode } from 'react';
import type { DriveItem } from '@smarteverything/domain';
import { FileGlyph } from '../../../components/files/file-glyph';
import { FolderBadgeImage, FolderGlyph } from '../../../components/files/folder-glyph';
import type { FolderGlyphWell } from '../../../components/files/folder-glyph-model';
import { Icon } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { useDriveLink } from '../data';
import { ENTRY_ICON, entryKindOf, isEntryItem } from '../model/item-content';

type Folder = Extract<DriveItem, { readonly kind: 'folder' }>;

function DriveIconBadge({
  folder,
  well,
}: {
  readonly folder: Folder;
  readonly well: FolderGlyphWell | null;
}): ReactNode {
  const url = useDriveLink(folder.id, folder.rev, 'icon');
  const badge =
    url === null ? null : { uri: url, cacheKey: `${folder.id}:${String(folder.rev)}:icon` };
  return <FolderBadgeImage badge={badge} well={well} />;
}

export function DriveFolderGlyph({
  folder,
  well = null,
}: {
  readonly folder: Folder;
  readonly well?: FolderGlyphWell | null;
}): ReactNode {
  const badge = folder.iconHint ? <DriveIconBadge folder={folder} well={well} /> : null;
  return <FolderGlyph look={folder} badge={badge} well={well} />;
}

export function DriveGlyph({
  item,
  well = null,
}: {
  readonly item: DriveItem;
  readonly well?: FolderGlyphWell | null;
}): ReactNode {
  if (item.kind === 'folder') return <DriveFolderGlyph folder={item} well={well} />;
  if (isEntryItem(item)) {
    const icon = ENTRY_ICON[item.kind];
    if (well === null) return <Icon name={icon} size={20} tone="variant" />;
    return <IconWell icon={icon} colour="on-surface-variant" size={well} />;
  }
  return <FileGlyph kind="file" name={item.name} {...(well === null ? {} : { well })} />;
}

export function DriveKindGlyph({
  item,
  well,
}: {
  readonly item: DriveItem;
  readonly well?: FolderGlyphWell;
}): ReactNode {
  if (isEntryItem(item)) return <DriveGlyph item={item} well={well ?? null} />;
  return (
    <FileGlyph
      kind={entryKindOf(item)}
      name={item.name}
      {...(well === undefined ? {} : { well })}
    />
  );
}
