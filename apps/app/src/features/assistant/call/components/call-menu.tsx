import type { ReactNode, RefObject } from 'react';
import { View } from 'react-native';
import { BottomSheet } from '../../../../components/bottom-sheet';
import { measureAnchor, type Rect } from '../../../../components/anchor';
import { arrangeEntries, MenuRows, type MenuItem } from '../../../../components/menu-rows';
import { Popover } from '../../../../components/popover';
import { useSizeClass } from '../../../../design/size-class';

const POPOVER_WIDTH = 280;

export interface CallMenuProps {
  readonly open: boolean;
  readonly anchor: RefObject<View | null>;
  readonly label: string;
  readonly items: readonly MenuItem[];
  readonly onClose: () => void;
  readonly rect: Rect | null;
}

export function measureMenuAnchor(
  anchor: RefObject<View | null>,
  found: (rect: Rect) => void,
): void {
  measureAnchor(anchor, found);
}

export function CallMenu({ open, label, items, onClose, rect }: CallMenuProps): ReactNode {
  const { idiom, split } = useSizeClass();
  if (!open || rect === null) {
    return null;
  }
  const entries = arrangeEntries([], items);
  if (idiom === 'touch' && !split) {
    return (
      <BottomSheet open onClose={onClose} label={label} detents={['fit']}>
        <View className="-mx-4">
          <MenuRows entries={entries} close={onClose} layout="sheet" />
        </View>
      </BottomSheet>
    );
  }
  return (
    <Popover open onClose={onClose} anchor={rect} label={label} width={POPOVER_WIDTH}>
      <MenuRows
        entries={entries}
        close={onClose}
        layout={idiom === 'touch' ? 'touch-popover' : 'popover'}
      />
    </Popover>
  );
}
