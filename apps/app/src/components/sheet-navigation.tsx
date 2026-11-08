import {
  createContext,
  use,
  useId,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Keyboard, type View } from 'react-native';
import { isNative } from '../design/platform';
import type { Detent } from './bottom-sheet';
import { focusView } from './focus-request';

export interface SheetSubpage {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly detents?: readonly Detent[] | undefined;
  readonly scroll?: boolean | undefined;
  readonly compact?: boolean | undefined;
  readonly footer?: ReactNode;
  readonly opener?: RefObject<View | null> | undefined;
}

interface PageEntry {
  readonly id: string;
  readonly page: SheetSubpage;
  readonly focused: HTMLElement | null;
  readonly expanded: boolean;
  readonly focusBack: boolean;
}

interface SheetNavigation {
  readonly show: (id: string, page: SheetSubpage) => void;
  readonly remove: (id: string) => void;
}

const SheetNavigationContext = createContext<SheetNavigation | null>(null);

export function useSheetSubpage(open: boolean, page: SheetSubpage): boolean {
  const navigation = use(SheetNavigationContext);
  const id = useId();
  useLayoutEffect(() => {
    if (!open || navigation === null) return undefined;
    if (isNative()) Keyboard.dismiss();
    return (): void => {
      navigation.remove(id);
    };
  }, [open, id, navigation]);
  useLayoutEffect(() => {
    if (open) navigation?.show(id, page);
  }, [open, id, navigation, page]);
  return navigation !== null;
}

function focusOfPage(): HTMLElement | null {
  if (isNative()) return null;
  const node = document.activeElement;
  return node instanceof HTMLElement && node !== document.body ? node : null;
}

function showPage(
  pages: readonly PageEntry[],
  id: string,
  page: SheetSubpage,
  focused: HTMLElement | null,
): readonly PageEntry[] {
  const previous = pages.find((entry) => entry.id === id);
  if (previous === undefined) {
    const covered = pages.map((entry, index) =>
      index === pages.length - 1 ? { ...entry, focusBack: false } : entry,
    );
    return [...covered, { id, page, focused, expanded: false, focusBack: true }];
  }
  if (previous.page === page) return pages;
  return pages.map((entry) => (entry.id === id ? { ...entry, page } : entry));
}

function removePage(pages: readonly PageEntry[], id: string): readonly PageEntry[] {
  const index = pages.findIndex((entry) => entry.id === id);
  return index < 0 ? pages : pages.slice(0, index);
}

function useRestoreOpener(pages: readonly PageEntry[]): void {
  const previous = useRef(pages);
  const restore = useEffectEvent((): (() => void) | undefined => {
    const closed = previous.current[pages.length];
    previous.current = pages;
    if (closed === undefined || pages.some((entry) => entry.id === closed.id)) return undefined;
    const frame = requestAnimationFrame(() => {
      const opener = closed.page.opener?.current;
      if (opener !== null && opener !== undefined) focusView(opener);
      else if (closed.focused?.isConnected === true) closed.focused.focus();
    });
    return (): void => {
      cancelAnimationFrame(frame);
    };
  });
  const activeId = pages.at(-1)?.id;
  useLayoutEffect(() => restore(), [activeId]);
}

interface NavigationState {
  readonly pages: readonly PageEntry[];
  readonly navigation: SheetNavigation;
  readonly back: () => void;
  readonly setExpanded: (id: string, expanded: boolean) => void;
}

export function useSheetNavigation(closeRoot: () => void): NavigationState {
  const [pages, setPages] = useState<readonly PageEntry[]>([]);
  useRestoreOpener(pages);
  const navigation = useMemo<SheetNavigation>(
    () => ({
      show: (id, page): void => {
        const focused = focusOfPage();
        setPages((previous) => showPage(previous, id, page, focused));
      },
      remove: (id): void => {
        setPages((previous) => removePage(previous, id));
      },
    }),
    [],
  );
  return {
    pages,
    navigation,
    back: (): void => {
      const active = pages.at(-1);
      if (active === undefined) closeRoot();
      else active.page.onClose();
    },
    setExpanded: (id, expanded): void => {
      setPages((previous) =>
        previous.map((entry) =>
          entry.id === id && entry.expanded !== expanded ? { ...entry, expanded } : entry,
        ),
      );
    },
  };
}

export function SheetNavigationProvider({
  navigation,
  children,
}: {
  readonly navigation: SheetNavigation;
  readonly children: ReactNode;
}): ReactNode {
  return <SheetNavigationContext value={navigation}>{children}</SheetNavigationContext>;
}
