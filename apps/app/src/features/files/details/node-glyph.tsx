import type { ReactNode } from 'react';
import { FileGlyph } from '../../../components/files/file-glyph';
import { FolderBadgeImage, FolderGlyph } from '../../../components/files/folder-glyph';
import type { FolderGlyphWell } from '../../../components/files/folder-glyph-model';
import { Icon } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { KIND_ICON } from '../browser/node-glyph';
import type { FileNode } from '../source/types';

export function NodeGlyph({
  node,
  icon,
  well = null,
}: {
  readonly node: FileNode;
  readonly icon: string | null;
  readonly well?: FolderGlyphWell | null;
}): ReactNode {
  if (node.kind === 'folder') {
    const badge =
      icon === null ? null : { uri: icon, cacheKey: `${node.key}:${node.modifiedAt ?? ''}:icon` };
    return (
      <FolderGlyph
        look={{ colour: node.marks.colour, iconHint: node.marks.iconHint }}
        badge={<FolderBadgeImage badge={badge} well={well} />}
        well={well}
      />
    );
  }
  if (node.kind === 'special') {
    if (well === null) return <Icon name={KIND_ICON.special} size={20} tone="variant" />;
    return <IconWell icon={KIND_ICON.special} colour="on-surface-variant" size={well} />;
  }
  return (
    <FileGlyph
      kind={node.kind === 'link' ? 'link' : 'file'}
      name={node.name}
      {...(well === null ? {} : { well })}
    />
  );
}
