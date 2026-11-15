import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { cn } from '../../design/cn';
import { Icon } from '../icon';
import { IconWell } from '../icon-well';
import { folderGlyphOf, type FolderGlyphWell, type FolderLook } from './folder-glyph-model';

export interface FolderBadge {
  readonly uri: string;
  readonly cacheKey: string;
}

type GlyphSize = FolderGlyphWell | 'plain';

const BOX: Readonly<Record<GlyphSize, string>> = {
  plain: 'size-5',
  s: 'size-7',
  m: 'size-9',
  l: 'size-12',
};

const BADGE: Readonly<Record<GlyphSize, string>> = {
  plain: 'size-2.5',
  s: 'size-3.5',
  m: 'size-4.5',
  l: 'size-6',
};

const BADGE_IMAGE: Readonly<Record<GlyphSize, string>> = {
  plain: 'size-2',
  s: 'size-3',
  m: 'size-4',
  l: 'size-5.5',
};

export function FolderBadgeImage({
  badge,
  well = null,
}: {
  readonly badge: FolderBadge | null;
  readonly well?: FolderGlyphWell | null;
}): ReactNode {
  const size = well ?? 'plain';
  return (
    <View
      aria-hidden
      className={cn(
        'absolute -bottom-0.5 -right-0.5 items-center justify-center overflow-hidden rounded-xs border border-surface-1 bg-surface-1',
        BADGE[size],
      )}
    >
      {badge === null ? null : (
        <View className={BADGE_IMAGE[size]}>
          <Image
            source={{ uri: badge.uri, cacheKey: badge.cacheKey }}
            contentFit="contain"
            cachePolicy="disk"
            accessible={false}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}
    </View>
  );
}

export interface FolderGlyphProps {
  readonly look: FolderLook;
  readonly badge?: ReactNode;
  readonly well?: FolderGlyphWell | null;
}

export function FolderGlyph({ look, badge = null, well = null }: FolderGlyphProps): ReactNode {
  const glyph = folderGlyphOf(look, well);
  return (
    <View
      accessible
      accessibilityLabel={glyph.label}
      className={cn('items-center justify-center', BOX[well ?? 'plain'])}
    >
      {well === null ? (
        <Icon name="folder" size={20} colour={glyph.colour} />
      ) : (
        <IconWell icon="folder" colour={glyph.colour} size={well} />
      )}
      {glyph.badge === null ? null : badge}
    </View>
  );
}
