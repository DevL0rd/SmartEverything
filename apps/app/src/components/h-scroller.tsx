import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useIdiom } from '../design/platform';
import { IconButton } from './icon-button';

const STEP = 320;

function Arrows({ scrollBy }: { readonly scrollBy: (delta: number) => void }): ReactNode {
  return (
    <>
      <View className="absolute inset-y-0 left-0 justify-center">
        <IconButton
          icon="chevronLeft"
          label="Scroll back"
          variant="tonal"
          onPress={() => {
            scrollBy(-STEP);
          }}
        />
      </View>
      <View className="absolute inset-y-0 right-0 justify-center">
        <IconButton
          icon="chevronRight"
          label="Scroll forward"
          variant="tonal"
          onPress={() => {
            scrollBy(STEP);
          }}
        />
      </View>
    </>
  );
}

export function HScroller({
  children,
  label,
  fill = false,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly fill?: boolean;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const ref = useRef<ScrollView>(null);
  const [offset, setOffset] = useState(0);
  const [hovered, setHovered] = useState(false);
  const scrollBy = (delta: number): void => {
    ref.current?.scrollTo({ x: Math.max(0, offset + delta), animated: true });
  };
  return (
    <View
      accessibilityLabel={label}
      className={fill ? 'relative flex-1' : 'relative'}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        scrollEventThrottle={64}
        onScroll={(event) => {
          setOffset(event.nativeEvent.contentOffset.x);
        }}
        {...(fill ? { className: 'flex-1' } : {})}
        contentContainerClassName={fill ? 'h-full gap-grid-gap' : 'gap-grid-gap'}
      >
        {children}
      </ScrollView>
      {pointer && hovered ? <Arrows scrollBy={scrollBy} /> : null}
    </View>
  );
}
