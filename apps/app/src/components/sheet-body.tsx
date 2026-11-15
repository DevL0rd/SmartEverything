import { createContext, use, useState, type ReactNode } from 'react';
import {
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { cn } from '../design/cn';
import { isNative } from '../design/platform';

type Reveal = (node: View | null) => void;

const SheetRevealContext = createContext<Reveal | null>(null);

export function useSheetReveal(): Reveal {
  const reveal = use(SheetRevealContext);
  if (reveal === null) {
    throw new Error('useSheetReveal is only available inside a scrolling sheet body.');
  }
  return reveal;
}

function revealOnWeb(node: View | null): void {
  const element: unknown = node;
  if (element instanceof HTMLElement)
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function nextOffset(top: number, height: number, offset: number, seen: number): number | null {
  if (top < offset) return top;
  if (top + height <= offset + seen) return null;
  return Math.min(top, top + height - seen);
}

class NativeScroller {
  private view: ScrollView | null = null;

  private offset = 0;

  private height = 0;

  readonly attach = (view: ScrollView | null): void => {
    this.view = view;
  };

  readonly laidOut = (event: LayoutChangeEvent): void => {
    this.height = event.nativeEvent.layout.height;
  };

  readonly scrolled = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    this.offset = event.nativeEvent.contentOffset.y;
  };

  readonly reveal: Reveal = (node) => {
    const view = this.view;
    const content: unknown = view?.getInnerViewNode();
    if (node === null || view === null || typeof content !== 'number') return;
    node.measureLayout(content, (_left, top, _width, height) => {
      const target = nextOffset(top, height, this.offset, this.height);
      if (target !== null) view.scrollTo({ y: target, animated: true });
    });
  };
}

export function SheetBody({
  scroll,
  padding,
  fit = false,
  fill = false,
  reading = false,
  children,
}: {
  readonly scroll: boolean;
  readonly padding: string;
  readonly fit?: boolean;
  readonly fill?: boolean;
  readonly reading?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  if (scroll) {
    return (
      <ScrollingBody padding={padding} fill={fill} reading={reading}>
        {children}
      </ScrollingBody>
    );
  }
  return <View className={cn('min-h-0', fit ? 'shrink' : 'flex-1', padding)}>{children}</View>;
}

function ScrollingBody({
  padding,
  fill,
  reading,
  children,
}: {
  readonly padding: string;
  readonly fill: boolean;
  readonly reading: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const keyboardScroll = reading && !isNative();
  const [native] = useState(() => new NativeScroller());
  const { attach, laidOut, scrolled, reveal } = native;
  return (
    <SheetRevealContext value={isNative() ? reveal : revealOnWeb}>
      <ScrollView
        ref={attach}
        onLayout={laidOut}
        onScroll={scrolled}
        scrollEventThrottle={16}
        className={cn(
          'min-h-0',
          fill ? 'flex-1' : 'shrink',
          keyboardScroll &&
            'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
        )}
        tabIndex={keyboardScroll ? 0 : undefined}
        role={keyboardScroll ? 'region' : undefined}
        accessibilityLabel={keyboardScroll ? 'Contents' : undefined}
        contentContainerClassName={padding}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SheetRevealContext>
  );
}
