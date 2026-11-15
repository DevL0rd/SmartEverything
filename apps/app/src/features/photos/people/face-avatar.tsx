import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Image, type ImageLoadEventData } from 'expo-image';
import type { PhotoBox, PhotoGroupKind } from '@smarteverything/domain';
import { Icon, type IconProps } from '../../../components/icon';
import { cn } from '../../../design/cn';
import { useMotion } from '../../../design/motion';
import { useCoverUrl } from '../places/cover';
import { faceCropOf } from './model';

const FADE_MS = 120;

const GLYPH_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40] as const satisfies readonly NonNullable<
  IconProps['size']
>[];

function glyphSizeOf(avatar: number): (typeof GLYPH_SIZES)[number] {
  const wanted = avatar * 0.4;
  return GLYPH_SIZES.reduce((best, size) =>
    Math.abs(size - wanted) < Math.abs(best - wanted) ? size : best,
  );
}

export interface FaceAvatarProps {
  readonly itemId: string | null;
  readonly box: PhotoBox | null;
  readonly kind: PhotoGroupKind;
  readonly size: number;
  readonly className?: string;
}

function aspectOf(event: ImageLoadEventData): number | null {
  const { width, height } = event.source;
  return width > 0 && height > 0 ? width / height : null;
}

function Crop({
  url,
  box,
  size,
}: {
  readonly url: string;
  readonly box: PhotoBox;
  readonly size: number;
}): ReactNode {
  const [aspect, setAspect] = useState<number | null>(null);
  const motion = useMotion();
  const crop = aspect === null ? null : faceCropOf(box, aspect, size);
  const placed =
    crop === null
      ? { position: 'absolute' as const, width: size, height: size }
      : { position: 'absolute' as const, ...crop };
  return (
    <Image
      source={{ uri: url }}
      contentFit="cover"
      cachePolicy="disk"
      accessible={false}
      transition={motion.reduced ? 0 : FADE_MS}
      onLoad={(event) => {
        setAspect(aspectOf(event));
      }}
      style={placed}
    />
  );
}

export function FaceAvatar({ itemId, box, kind, size, className }: FaceAvatarProps): ReactNode {
  const url = useCoverUrl(itemId);
  const frame = { width: size, height: size };
  return (
    <View
      accessible={false}
      style={frame}
      className={cn(
        'items-center justify-center overflow-hidden rounded-full bg-surface-3',
        className,
      )}
    >
      {url === null || box === null ? (
        <Icon name={kind === 'pet' ? 'dog' : 'user'} size={glyphSizeOf(size)} tone="faint" />
      ) : (
        <Crop url={url} box={box} size={size} />
      )}
    </View>
  );
}
