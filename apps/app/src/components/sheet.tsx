import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';
import type { FocusTarget } from './focus-request';
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
  readonly headerAction?: ReactNode;
  readonly label?: string;
  readonly detents?: readonly Detent[];
  readonly kind?: PointerSheetKind;
  readonly anchor?: Rect | null;
  readonly wide?: boolean;
  readonly footer?: ReactNode;
  readonly scroll?: boolean;
  readonly reading?: boolean;
  readonly subpage?: boolean | { readonly opener: RefObject<View | null> } | undefined;
  readonly initialFocus?: RefObject<FocusTarget | null>;
  readonly children: ReactNode;
}

function TouchSheet({
  open,
  onClose,
  title,
  headerAction,
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
      headerAction={headerAction}
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

function PointerSheet({
  name,
  open,
  onClose,
  title,
  headerAction,
  kind = 'dialog',
  anchor = null,
  wide = false,
  footer,
  scroll = true,
  reading = false,
  initialFocus,
  children,
}: SheetProps & { readonly name: string }): ReactNode {
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
      headerAction={headerAction}
      label={name}
      footer={footer}
      scroll={scroll}
      reading={reading}
      kind={kind}
      wide={wide}
      {...(initialFocus === undefined ? {} : { initialFocus })}
    >
      {children}
    </DialogFrame>
  );
}

function usePointerSubpage({
  name,
  open,
  onClose,
  title,
  kind = 'dialog',
  footer,
  scroll = true,
  subpage = false,
  children,
}: SheetProps & { readonly name: string }): boolean {
  const mayNest = subpage !== false && kind !== 'popover';
  const nested = useSheetSubpage(mayNest && open, {
    title: title ?? name,
    onClose,
    footer,
    scroll,
    children,
    opener: typeof subpage === 'boolean' ? undefined : subpage.opener,
  });
  return mayNest && nested;
}

function NestablePointerSheet(props: SheetProps & { readonly name: string }): ReactNode {
  if (usePointerSubpage(props)) return null;
  return <PointerSheet {...props} />;
}

export function Sheet(props: SheetProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const name = props.label ?? props.title ?? 'Sheet';
  if (touch) {
    return <TouchSheet {...props} name={name} />;
  }
  return <NestablePointerSheet {...props} name={name} />;
}
