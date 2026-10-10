import type { ReactNode } from 'react';
import { IconButton } from '../../../components/icon-button';
import { useAddGlass } from '../data/water';

export function GlassIcon({
  day,
  today,
}: {
  readonly day: string;
  readonly today: string;
}): ReactNode {
  const glass = useAddGlass(day, today);
  return glass.ml === null ? null : (
    <IconButton
      icon="plus"
      label={`Add a ${String(glass.ml)} ml glass of water`}
      variant="tonal"
      onPress={glass.add}
    />
  );
}
