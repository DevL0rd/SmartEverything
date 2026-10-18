import type { ReactNode, RefObject } from 'react';
import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { ValueStore, useSelected } from '../design/external-store';
import { isNative } from '../design/platform';
import {
  edgeHighlight,
  keepHighlight,
  stepHighlight,
  type HighlightStep,
  type ListEntry,
} from './keyboard-list-math';
import { useEscape } from './use-escape';

export type { ListEntry } from './keyboard-list-math';

interface ListControl {
  readonly highlighted: ValueStore<string | null>;
  readonly rowDomId: (id: string) => string;
  readonly listboxId: string;
  readonly label: string;
  readonly active: boolean;
}

const ListContext = createContext<ListControl | null>(null);

class KeyboardRowOutsideListError extends Error {
  override readonly name = 'KeyboardRowOutsideListError';

  constructor() {
    super('useKeyboardRow needs a KeyboardList above it.');
  }
}

export interface KeyboardRow {
  readonly highlighted: boolean;
  readonly nativeID: string;
  readonly highlight: () => void;
}

export function useKeyboardRow(id: string): KeyboardRow {
  const control = use(ListContext);
  if (control === null) {
    throw new KeyboardRowOutsideListError();
  }
  const highlighted = useSelected(control.highlighted, (current) => current === id);
  return {
    highlighted,
    nativeID: control.rowDomId(id),
    highlight: (): void => {
      control.highlighted.set(id);
    },
  };
}

export interface KeyboardCombobox {
  readonly role: 'combobox';
  readonly 'aria-expanded': boolean;
  readonly 'aria-controls': string | undefined;
  readonly 'aria-autocomplete': 'list';
  readonly 'aria-activedescendant': string | undefined;
}

export function useKeyboardCombobox(): KeyboardCombobox | null {
  const control = use(ListContext);
  const current = useSelected(control?.highlighted ?? NO_HIGHLIGHT, (id) => id);
  if (control === null) {
    return null;
  }
  return {
    role: 'combobox',
    'aria-expanded': control.active,
    'aria-controls': control.active ? control.listboxId : undefined,
    'aria-autocomplete': 'list',
    'aria-activedescendant':
      control.active && current !== null ? control.rowDomId(current) : undefined,
  };
}

export function KeyboardListbox({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  const control = use(ListContext);
  const ref = useRef<View>(null);
  useEffect(() => {
    const element = ref.current;
    if (!isNative() && element instanceof HTMLElement) {
      element.setAttribute('role', 'listbox');
    }
  }, []);
  if (control === null) {
    throw new KeyboardRowOutsideListError();
  }
  return (
    <View
      ref={ref}
      role="list"
      nativeID={control.listboxId}
      accessibilityLabel={control.label}
      className={cn(className)}
    >
      {children}
    </View>
  );
}

export interface KeyboardListProps {
  readonly items: readonly ListEntry[];
  readonly onActivate: (id: string) => void;
  readonly onEscape?: () => void;
  readonly onHighlight?: (id: string, index: number) => void;
  readonly autoHighlight?: boolean;
  readonly wrap?: boolean;
  readonly focusable?: boolean;
  readonly combobox?: boolean;
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}

const NO_HIGHLIGHT = new ValueStore<string | null>(null);

const STEPS: Readonly<Record<string, HighlightStep>> = { ArrowDown: 1, ArrowUp: -1 };

const EDGES: Readonly<Record<string, 'first' | 'last'>> = { Home: 'first', End: 'last' };

function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

interface KeyContext {
  readonly items: readonly ListEntry[];
  readonly current: string | null;
  readonly wrap: boolean;
  readonly textEntry: boolean;
}

function nextHighlight(
  key: string,
  { items, current, wrap, textEntry }: KeyContext,
): string | null | undefined {
  const step = STEPS[key];
  if (step !== undefined) {
    return stepHighlight(items, current, step, wrap);
  }
  const edge = EDGES[key];
  return edge === undefined || textEntry ? undefined : edgeHighlight(items, edge);
}

function useActiveDescendant(
  container: RefObject<View | null>,
  control: ListControl,
  active: boolean,
): void {
  useEffect(() => {
    const root = container.current;
    if (isNative() || !active || !(root instanceof HTMLElement)) {
      return undefined;
    }
    root.setAttribute('role', 'listbox');
    let owner: Element | null = null;
    const apply = (): void => {
      const id = control.highlighted.get();
      const focused = document.activeElement;
      const next = focused instanceof Element && root.contains(focused) ? focused : root;
      if (owner !== null && owner !== next) {
        owner.removeAttribute('aria-activedescendant');
      }
      owner = next;
      if (id === null) {
        next.removeAttribute('aria-activedescendant');
      } else {
        next.setAttribute('aria-activedescendant', control.rowDomId(id));
      }
    };
    apply();
    root.addEventListener('focusin', apply);
    const stop = control.highlighted.subscribe(apply);
    return (): void => {
      root.removeEventListener('focusin', apply);
      stop();
      owner?.removeAttribute('aria-activedescendant');
    };
  }, [container, control, active]);
}

interface Behaviour {
  readonly items: readonly ListEntry[];
  readonly onActivate: (id: string) => void;
  readonly onHighlight: ((id: string, index: number) => void) | undefined;
  readonly wrap: boolean;
}

function activation(event: KeyboardEvent, current: string | null, inside: boolean): string | null {
  return event.key === 'Enter' && !event.shiftKey && inside ? current : null;
}

function useListKeys(
  container: RefObject<View | null>,
  control: ListControl,
  active: boolean,
  behaviour: Behaviour,
): void {
  const move = useEffectEvent((event: KeyboardEvent, root: HTMLElement) => {
    const { items, onActivate, onHighlight, wrap } = behaviour;
    const textEntry = isTextEntry(event.target);
    const current = control.highlighted.get();
    const activate = activation(event, current, textEntry || event.target === root);
    if (activate !== null) {
      event.preventDefault();
      onActivate(activate);
      return;
    }
    const next = nextHighlight(event.key, { items, current, wrap, textEntry });
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    control.highlighted.set(next);
    const index = items.findIndex((entry) => entry.id === next);
    if (next !== null && index >= 0) {
      onHighlight?.(next, index);
      document.getElementById(control.rowDomId(next))?.scrollIntoView({ block: 'nearest' });
    }
  });
  useEffect(() => {
    const root = container.current;
    if (isNative() || !active || !(root instanceof HTMLElement)) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (event.target instanceof Node && root.contains(event.target) && !event.isComposing) {
        move(event, root);
      }
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [container, active]);
}

function useHighlightReset(
  control: ListControl,
  items: readonly ListEntry[],
  autoHighlight: boolean,
  onHighlight: Behaviour['onHighlight'],
): void {
  const settle = useEffectEvent(() => {
    const kept = keepHighlight(items, control.highlighted.get());
    const next = kept === null && autoHighlight ? edgeHighlight(items, 'first') : kept;
    control.highlighted.set(next);
    const index = items.findIndex((entry) => entry.id === next);
    if (next !== null && index >= 0) {
      onHighlight?.(next, index);
    }
  });
  useEffect(() => {
    settle();
  }, [items]);
}

export function KeyboardList({
  items,
  onActivate,
  onEscape,
  onHighlight,
  autoHighlight = false,
  wrap = true,
  focusable = false,
  combobox = false,
  label,
  className,
  children,
}: KeyboardListProps): ReactNode {
  const container = useRef<View>(null);
  const listId = useId();
  const [base] = useState(() => ({
    highlighted: new ValueStore<string | null>(null),
    rowDomId: (id: string): string => `${listId}-${encodeURIComponent(id)}`,
  }));
  const active = items.length > 0;
  const control = useMemo<ListControl>(
    () => ({ ...base, listboxId: `${listId}-listbox`, label, active }),
    [base, listId, label, active],
  );
  useHighlightReset(control, items, autoHighlight, onHighlight);
  useListKeys(container, control, active, { items, onActivate, onHighlight, wrap });
  useActiveDescendant(container, control, active && !combobox);
  useEscape(
    onEscape !== undefined,
    (): void => {
      onEscape?.();
    },
    container,
  );
  return (
    <ListContext value={control}>
      <View
        ref={container}
        role={combobox ? undefined : 'list'}
        accessibilityLabel={combobox ? undefined : label}
        focusable={focusable}
        className={cn(className)}
      >
        {children}
      </View>
    </ListContext>
  );
}
