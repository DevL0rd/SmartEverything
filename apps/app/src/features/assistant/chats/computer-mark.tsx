import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Icon } from '../../../components/icon';
import { cn } from '../../../design/cn';
import { useDevice } from '../../../store/selectors';
import { computerGlyph } from '../../computers';
import type { SourceMarkSize } from './source-mark';

const BOX: Readonly<Record<SourceMarkSize, string>> = {
  20: 'size-5',
  28: 'size-7',
  32: 'size-8',
  40: 'size-10',
};

const GLYPH: Readonly<Record<SourceMarkSize, 16 | 20>> = { 20: 16, 28: 16, 32: 16, 40: 20 };

export function ComputerMark({
  computerId,
  size,
  busy = false,
}: {
  readonly computerId: string;
  readonly size: SourceMarkSize;
  readonly busy?: boolean;
}): ReactNode {
  const device = useDevice(computerId);
  return (
    <View
      aria-hidden
      className={cn('items-center justify-center rounded-full bg-surface-3', BOX[size])}
    >
      {busy ? (
        <ActivityIndicator size="small" colorClassName="accent-on-surface-variant" />
      ) : (
        <Icon
          name={device === null ? 'monitor' : computerGlyph(device)}
          size={GLYPH[size]}
          tone="variant"
        />
      )}
    </View>
  );
}
