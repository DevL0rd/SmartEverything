import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';
import type { Rect } from '../../../../../components/anchor';
import { BottomSheet, type Detent } from '../../../../../components/bottom-sheet';
import { Button } from '../../../../../components/button';
import { Popover } from '../../../../../components/popover';
import { useSheetSubpage } from '../../../../../components/sheet-navigation';

const PICKER_DETENTS: readonly Detent[] = ['full'];
const MIN_POPOVER_WIDTH = 280;

interface OptionPickerSurfaceProps {
  readonly label: string;
  readonly touch: boolean;
  readonly multiple: boolean;
  readonly anchor: Rect | null;
  readonly opener: RefObject<View | null>;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function OptionPickerSurface({
  label,
  touch,
  multiple,
  anchor,
  opener,
  onClose,
  children,
}: OptionPickerSurfaceProps): ReactNode {
  const open = anchor !== null;
  const footer = multiple ? <Button label="Done" onPress={onClose} grow /> : undefined;
  const subpage = useSheetSubpage(touch && open, {
    title: label,
    onClose,
    opener,
    detents: PICKER_DETENTS,
    compact: false,
    footer,
    children,
  });
  if (touch && subpage) return null;
  if (touch) {
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        title={label}
        label={label}
        detents={PICKER_DETENTS}
        footer={footer}
      >
        {children}
      </BottomSheet>
    );
  }
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchor={anchor}
      label={label}
      width={Math.max(MIN_POPOVER_WIDTH, anchor?.width ?? 0)}
    >
      {children}
    </Popover>
  );
}
