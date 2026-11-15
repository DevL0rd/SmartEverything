import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { FolderBadgeImage, FolderGlyph } from '../../../components/files/folder-glyph';
import type { FolderGlyphWell } from '../../../components/files/folder-glyph-model';
import { Icon, type IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { cn } from '../../../design/cn';
import type { FileAbilities } from '../source/abilities';
import type { FileNode, FileNodeKind, FileSource } from '../source/types';

export const KIND_ICON: Readonly<Record<FileNodeKind, IconName>> = {
  folder: 'folder',
  image: 'image',
  video: 'film',
  audio: 'music',
  document: 'fileText',
  archive: 'archive',
  link: 'link',
  special: 'cpu',
  other: 'fileText',
};

const THUMB_KINDS: ReadonlySet<FileNodeKind> = new Set(['image', 'video']);

export function thumbWanted(node: FileNode, abilities: FileAbilities): boolean {
  return abilities.thumbnails && THUMB_KINDS.has(node.kind);
}

interface GlyphProps<O> {
  readonly node: FileNode<O>;
  readonly source: FileSource<O>;
  readonly well: FolderGlyphWell | null;
}

function FolderBadge<O>({ node, source, well }: GlyphProps<O>): ReactNode {
  const icon = source.useLinks(node).icon;
  return (
    <FolderBadgeImage
      badge={icon === null ? null : { uri: icon, cacheKey: `${source.id}:${node.key}:icon` }}
      well={well}
    />
  );
}

export function NodeGlyph<O>(props: GlyphProps<O>): ReactNode {
  const { node, well } = props;
  if (node.kind === 'folder') {
    const look = { colour: node.marks.colour, iconHint: node.marks.iconHint };
    return (
      <FolderGlyph
        look={look}
        well={well}
        badge={node.marks.iconHint ? <FolderBadge {...props} /> : null}
      />
    );
  }
  if (well === null) return <Icon name={KIND_ICON[node.kind]} size={20} tone="variant" />;
  return <IconWell icon={KIND_ICON[node.kind]} colour="on-surface-variant" size={well} />;
}

export function NodeThumb<O>({
  node,
  source,
  className,
}: {
  readonly node: FileNode<O>;
  readonly source: FileSource<O>;
  readonly className: string;
}): ReactNode {
  const url = source.useLinks(node).thumb;
  return (
    <View className={cn('items-center justify-center overflow-hidden bg-surface-3', className)}>
      {url === null ? (
        <Icon name={KIND_ICON[node.kind]} size={16} tone="variant" />
      ) : (
        <Image
          source={{ uri: url }}
          recyclingKey={`${source.id}:${node.key}:${node.modifiedAt ?? ''}`}
          contentFit="cover"
          accessibilityLabel={node.name}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

export function RowLeading<O>({
  node,
  source,
  abilities,
}: {
  readonly node: FileNode<O>;
  readonly source: FileSource<O>;
  readonly abilities: FileAbilities;
}): ReactNode {
  if (thumbWanted(node, abilities)) {
    return <NodeThumb node={node} source={source} className="h-6 w-8 rounded-xs" />;
  }
  return <NodeGlyph node={node} source={source} well={null} />;
}
