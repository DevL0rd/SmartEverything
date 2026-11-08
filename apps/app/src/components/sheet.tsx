import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';
import { useIdiom } from '../design/platform';
import type { Rect } from './anchor';
import { BottomSheet, type Detent } from './bottom-sheet';
import { DialogFrame } from './dialog-frame';
import { Popover } from './popover';
import { useSheetSubpage } from './sheet-navigation';

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
  readonly reading?: boolean;
  readonly subpage?: boolean | { readonly opener: RefObject<View | null> } | undefined;
  readonly children: ReactNode;
}

function TouchSheet({
  open,
  onClose,
  title,
  name,
  detents = ['half', 'full'],
  footer,
  scroll = true,
  reading = false,
  subpage = false,
  children,
}: SheetProps & { readonly name: string }): ReactNode {
  const mayNest = subpage !== false;
  const nested = useSheetSubpage(mayNest && open, {
    title: title ?? name,
    onClose,
    detents,
    footer,
    scroll,
    children,
    compact: false,
    opener: typeof subpage === 'boolean' ? undefined : subpage.opener,
  });
  if (mayNest && nested) return null;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      label={name}
      detents={detents}
      footer={footer}
      scroll={scroll}
      reading={reading}
    >
      {children}
    </BottomSheet>
  );
}

export function Sheet(props: SheetProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const name = props.label ?? props.title ?? 'Sheet';
  if (touch) {
    return <TouchSheet {...props} name={name} />;
  }
  const {
    open,
    onClose,
    title,
    kind = 'dialog',
    anchor = null,
    wide = false,
    footer,
    scroll = true,
    reading = false,
    children,
  } = props;
  if (kind === 'popover') {
    return (
      <Popover open={open} onClose={onClose} anchor={anchor} label={name}>
        {children}
      </Popover>
    );
  }
  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      title={title}
      label={name}
      footer={footer}
      scroll={scroll}
      reading={reading}
      kind={kind}
      wide={wide}
    >
      {children}
    </DialogFrame>
  );
}
