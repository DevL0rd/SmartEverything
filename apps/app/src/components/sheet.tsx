import type { ReactNode } from 'react';
import { useIdiom } from '../design/platform';
import type { Rect } from './anchor';
import { BottomSheet, type Detent } from './bottom-sheet';
import { DialogFrame } from './dialog-frame';
import { Popover } from './popover';

type PointerSheetKind = 'dialog' | 'popover' | 'inspector';

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly label?: string;
  readonly detents?: readonly Detent[];
  readonly kind?: PointerSheetKind;
  readonly anchor?: Rect | null;
  readonly wide?: boolean;
  readonly footer?: ReactNode;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}

export function Sheet({
  open,
  onClose,
  title,
  label,
  detents = ['half', 'full'],
  kind = 'dialog',
  anchor = null,
  wide = false,
  footer,
  scroll = true,
  children,
}: SheetProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const name = label ?? title ?? 'Sheet';
  const shared = { open, onClose, title, label: name, footer, scroll };
  if (touch) {
    return (
      <BottomSheet {...shared} detents={detents}>
        {children}
      </BottomSheet>
    );
  }
  if (kind === 'popover') {
    return (
      <Popover open={open} onClose={onClose} anchor={anchor} label={name}>
        {children}
      </Popover>
    );
  }
  return (
    <DialogFrame {...shared} kind={kind} wide={wide}>
      {children}
    </DialogFrame>
  );
}
