import type { ReactNode, Ref } from 'react';
import { useState } from 'react';
import {
  Pressable,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type AccessibilityRole,
  type PressableProps,
} from 'react-native';
import { Link as RouterLink } from 'expo-router';
import type { AppHref } from './app-href';
import { cn } from '../design/cn';
import { useColour } from '../design/colour';
import { isNative, useIdiom } from '../design/platform';
import { useLinkIntent } from './link-intent';
import { spaceKeyProps } from './space-key';

const CHECKED_ROLES: ReadonlySet<AccessibilityRole> = new Set(['checkbox', 'radio', 'switch']);

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface InteractiveProps {
  readonly children: ReactNode;
  readonly hitSlop?: PressableProps['hitSlop'];
  readonly onPress?: (() => void) | undefined;
  readonly onLongPress?: (() => void) | undefined;
  readonly onPressIn?: (() => void) | undefined;
  readonly onPressOut?: (() => void) | undefined;
  readonly onContextMenu?: ((point: Point) => void) | undefined;
  readonly href?: AppHref | undefined;
  readonly disabled?: boolean | undefined;
  readonly selected?: boolean | undefined;
  readonly checked?: boolean | 'mixed' | undefined;
  readonly expanded?: boolean | undefined;
  readonly controls?: string | undefined;
  readonly label?: string | undefined;
  readonly hint?: string | undefined;
  readonly role?: AccessibilityRole | undefined;
  readonly className?: string | undefined;
  readonly layerClassName?: string | undefined;
  readonly onTone?: 'surface' | 'primary' | undefined;
  readonly focusInset?: boolean | undefined;
  readonly focusable?: boolean | undefined;
  readonly ref?: Ref<View> | undefined;
  readonly 'aria-describedby'?: string | undefined;
  readonly accessibilityActions?: readonly AccessibilityActionInfo[] | undefined;
  readonly onAccessibilityAction?: ((event: AccessibilityActionEvent) => void) | undefined;
}

interface ContextMenuEvent {
  readonly preventDefault: () => void;
  readonly nativeEvent: { readonly pageX: number; readonly pageY: number };
}

function contextMenuProps(handler: ((point: Point) => void) | undefined): {
  readonly onContextMenu?: (event: ContextMenuEvent) => void;
} {
  if (handler === undefined) {
    return {};
  }
  return {
    onContextMenu: (event: ContextMenuEvent): void => {
      event.preventDefault();
      handler({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    },
  };
}

type LayerState = 'idle' | 'hovered' | 'pressed';

const LAYER: Readonly<Record<LayerState, string>> = {
  idle: '',
  hovered: 'opacity-6',
  pressed: 'opacity-10',
};

function Layer({
  state,
  primary,
  className,
}: {
  readonly state: LayerState;
  readonly primary: boolean;
  readonly className: string | undefined;
}): ReactNode {
  if (state === 'idle') {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      className={cn(
        'absolute inset-0',
        primary ? 'bg-on-primary' : 'bg-on-surface',
        LAYER[state],
        className,
      )}
    />
  );
}

function layerState(
  pointer: boolean,
  hovered: boolean,
  pressed: boolean,
  disabled: boolean,
): LayerState {
  if (!pointer || disabled) {
    return 'idle';
  }
  if (pressed) {
    return 'pressed';
  }
  return hovered ? 'hovered' : 'idle';
}

function useHover(href: AppHref | undefined): {
  readonly hovered: boolean;
  readonly boost: () => void;
  readonly enter: () => void;
  readonly leave: () => void;
} {
  const [hovered, setHovered] = useState(false);
  const intent = useLinkIntent();
  const boost = (): void => {
    if (href !== undefined) {
      intent(href);
    }
  };
  return {
    hovered,
    boost,
    enter: (): void => {
      boost();
      setHovered(true);
    },
    leave: (): void => {
      setHovered(false);
    },
  };
}

interface AccessibilityInput {
  readonly role: AccessibilityRole | undefined;
  readonly href: AppHref | undefined;
  readonly label: string | undefined;
  readonly hint: string | undefined;
  readonly disabled: boolean;
  readonly selected: boolean | undefined;
  readonly checked: InteractiveProps['checked'];
  readonly expanded: boolean | undefined;
}

function accessibilityOf(input: AccessibilityInput): {
  readonly accessibilityRole: AccessibilityRole;
  readonly accessibilityLabel: string | undefined;
  readonly accessibilityHint: string | undefined;
  readonly accessibilityState: {
    readonly disabled: boolean;
    readonly selected?: boolean;
    readonly checked?: boolean | 'mixed';
    readonly expanded?: boolean;
  };
} {
  return {
    accessibilityRole: input.role ?? (input.href === undefined ? 'button' : 'link'),
    accessibilityLabel: input.label,
    accessibilityHint: input.hint,
    accessibilityState: {
      disabled: input.disabled,
      ...(input.selected === undefined ? {} : { selected: input.selected }),
      ...(input.checked === undefined ? {} : { checked: input.checked }),
      ...(input.expanded === undefined ? {} : { expanded: input.expanded }),
    },
  };
}

function pressableClass(disabled: boolean, inset: boolean, className: string | undefined): string {
  return cn(
    'overflow-hidden native:focus:outline-2 native:focus:outline-focus',
    'web:focus-visible:outline-2 web:focus-visible:outline-focus',
    inset
      ? 'native:focus:-outline-offset-2 web:focus-visible:-outline-offset-2'
      : 'native:focus:outline-offset-2 web:focus-visible:outline-offset-2',
    disabled && 'opacity-40',
    className,
  );
}

function both(first: () => void, second: (() => void) | undefined): () => void {
  return second === undefined
    ? first
    : (): void => {
        first();
        second();
      };
}

function PressedContent({
  children,
  state,
  primary,
  layerClassName,
}: {
  readonly children: ReactNode;
  readonly state: LayerState;
  readonly primary: boolean;
  readonly layerClassName: string | undefined;
}): ReactNode {
  return (
    <>
      {children}
      <Layer state={state} primary={primary} className={layerClassName} />
    </>
  );
}

function usePressFeedback(
  href: AppHref | undefined,
  tone: InteractiveProps['onTone'],
  onPressIn: InteractiveProps['onPressIn'],
): {
  readonly attributes: PressableProps;
  readonly state: (pressed: boolean, disabled: boolean) => LayerState;
} {
  const pointer = useIdiom() === 'pointer';
  const hover = useHover(href);
  const color = useColour(tone === 'primary' ? 'on-primary' : 'on-surface');
  return {
    attributes: {
      onPressIn: both(hover.boost, onPressIn),
      onHoverIn: hover.enter,
      onHoverOut: hover.leave,
      onFocus: hover.boost,
      android_ripple: { color, foreground: true },
    },
    state: (pressed, disabled): LayerState => layerState(pointer, hover.hovered, pressed, disabled),
  };
}

interface PressedProps extends Omit<InteractiveProps, 'href'> {
  readonly href?: string;
  readonly intentHref?: AppHref | undefined;
}

function webLinkProps(href: string | undefined, disabled: boolean): { readonly href?: string } {
  return isNative() || disabled || href === undefined ? {} : { href };
}

function Pressed(props: PressedProps): ReactNode {
  const {
    children,
    onPressIn,
    onContextMenu,
    href,
    intentHref,
    disabled = false,
    selected,
    checked,
    expanded,
    controls,
    label,
    hint,
    role,
    className,
    layerClassName,
    onTone,
    focusInset = false,
    ...forwarded
  } = props;
  const feedback = usePressFeedback(intentHref, onTone, onPressIn);
  const semantics = { role, href: intentHref, label, hint, disabled, selected, checked, expanded };
  return (
    <Pressable
      {...forwarded}
      {...webLinkProps(href, disabled)}
      {...contextMenuProps(onContextMenu)}
      {...spaceKeyProps(intentHref === undefined ? role : undefined, disabled, forwarded.onPress)}
      disabled={disabled}
      {...feedback.attributes}
      {...accessibilityOf(semantics)}
      aria-controls={controls}
      aria-expanded={expanded}
      aria-checked={role !== undefined && CHECKED_ROLES.has(role) ? checked : undefined}
      aria-selected={role === 'tab' ? selected : undefined}
      className={pressableClass(disabled, focusInset, className)}
    >
      {({ pressed }) => (
        <PressedContent
          state={feedback.state(pressed, disabled)}
          primary={onTone === 'primary'}
          layerClassName={layerClassName}
        >
          {children}
        </PressedContent>
      )}
    </Pressable>
  );
}

export function Interactive(props: InteractiveProps): ReactNode {
  const { href, ...pressed } = props;
  if (href === undefined || props.disabled === true) {
    return <Pressed {...pressed} intentHref={href} />;
  }
  return (
    <RouterLink href={href} asChild>
      <Pressed {...pressed} intentHref={href} />
    </RouterLink>
  );
}
