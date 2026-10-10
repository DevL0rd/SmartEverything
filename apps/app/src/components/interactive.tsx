import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, View, type AccessibilityRole } from 'react-native';
import { Link as RouterLink, type Href } from 'expo-router';
import { cn } from '../design/cn';
import { useColour } from '../design/colour';
import { useIdiom } from '../design/platform';
import { useLinkIntent } from './link-intent';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface InteractiveProps {
  readonly children: ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly onLongPress?: (() => void) | undefined;
  readonly onPressIn?: (() => void) | undefined;
  readonly onPressOut?: (() => void) | undefined;
  readonly onContextMenu?: ((point: Point) => void) | undefined;
  readonly href?: Href | undefined;
  readonly disabled?: boolean | undefined;
  readonly selected?: boolean | undefined;
  readonly checked?: boolean | undefined;
  readonly label?: string | undefined;
  readonly hint?: string | undefined;
  readonly role?: AccessibilityRole | undefined;
  readonly className?: string | undefined;
  readonly layerClassName?: string | undefined;
  readonly onTone?: 'surface' | 'primary' | undefined;
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

function useHover(href: Href | undefined): {
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
  readonly href: Href | undefined;
  readonly label: string | undefined;
  readonly hint: string | undefined;
  readonly disabled: boolean;
  readonly selected: boolean | undefined;
  readonly checked: boolean | undefined;
}

function accessibilityOf(input: AccessibilityInput): {
  readonly accessibilityRole: AccessibilityRole;
  readonly accessibilityLabel: string | undefined;
  readonly accessibilityHint: string | undefined;
  readonly accessibilityState: {
    readonly disabled: boolean;
    readonly selected?: boolean;
    readonly checked?: boolean;
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
    },
  };
}

function pressableClass(disabled: boolean, className: string | undefined): string {
  return cn(
    'relative overflow-hidden focus:outline-2 focus:outline-offset-2 focus:outline-focus',
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

function Pressed(props: InteractiveProps): ReactNode {
  const {
    children,
    onPressIn,
    onContextMenu,
    href,
    disabled = false,
    selected,
    checked,
    label,
    hint,
    role,
    className,
    layerClassName,
    onTone,
    ...forwarded
  } = props;
  const primary = onTone === 'primary';
  const pointer = useIdiom() === 'pointer';
  const hover = useHover(href);
  const ripple = { color: useColour(primary ? 'on-primary' : 'on-surface'), foreground: true };
  return (
    <Pressable
      {...forwarded}
      {...contextMenuProps(onContextMenu)}
      disabled={disabled}
      onPressIn={both(hover.boost, onPressIn)}
      onHoverIn={hover.enter}
      onHoverOut={hover.leave}
      onFocus={hover.boost}
      android_ripple={ripple}
      {...accessibilityOf({ role, href, label, hint, disabled, selected, checked })}
      className={pressableClass(disabled, className)}
    >
      {({ pressed }) => (
        <>
          {children}
          <Layer
            state={layerState(pointer, hover.hovered, pressed, disabled)}
            primary={primary}
            className={layerClassName}
          />
        </>
      )}
    </Pressable>
  );
}

export function Interactive(props: InteractiveProps): ReactNode {
  if (props.href === undefined || props.disabled === true) {
    return <Pressed {...props} />;
  }
  return (
    <RouterLink href={props.href} asChild>
      <Pressed {...props} />
    </RouterLink>
  );
}
