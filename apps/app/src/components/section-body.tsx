import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '../design/cn';

import { useSizeClass } from '../design/size-class';
import { useThemeSetting } from '../design/theme';
import { gutterOf } from '../design/tokens';
import { BodyWidthContext } from './page-shell/body-width';
import { frameBodyWidthOf, type FrameWidth, type RailWidth } from './page-shell/layout';

export type { FrameWidth } from './page-shell/layout';

export function FrameBodyWidth({
  scroll,
  width,
  railWidth,
  children,
}: BodyProps & { readonly railWidth?: RailWidth }): ReactNode {
  const size = useSizeClass();
  const gutter = gutterOf(size.width, size.idiom, useThemeSetting('density'));
  const bodyWidth = frameBodyWidthOf({
    area: size.area,
    gutter,
    width,
    scroll,
    ...(railWidth === undefined ? {} : { railWidth }),
  });
  return <BodyWidthContext value={bodyWidth}>{children}</BodyWidthContext>;
}

const BODY_WIDTH: Readonly<Record<FrameWidth, string>> = {
  reading: 'max-w-reading',
  detail: 'max-w-detail',
  dashboard: '',
};

interface BodyProps {
  readonly scroll: boolean;
  readonly width: FrameWidth;
  readonly children: ReactNode;
}

export function CompactBody({ scroll, width, children }: BodyProps): ReactNode {
  return (
    <View
      className={cn(
        'gap-section-gap',
        !scroll && 'w-full flex-1 self-center px-gutter pb-section-gap',
        !scroll && BODY_WIDTH[width],
      )}
    >
      <FrameBodyWidth scroll={scroll} width={width}>
        {children}
      </FrameBodyWidth>
    </View>
  );
}

export function WideBody({
  scroll,
  width,
  rail,
  railWidth,
  children,
}: BodyProps & { readonly rail: ReactNode; readonly railWidth: RailWidth }): ReactNode {
  const body = (
    <FrameBodyWidth scroll={scroll} width={width} railWidth={railWidth}>
      {children}
    </FrameBodyWidth>
  );
  const inner = cn('w-full gap-section-gap self-start', BODY_WIDTH[width]);
  return (
    <View className="w-full flex-1 flex-row pl-gutter">
      {rail}
      <View className="min-w-0 flex-1">
        {!scroll ? (
          <View className={cn(inner, 'flex-1 px-gutter pb-section-gap pt-2')}>{body}</View>
        ) : (
          <ScrollView contentContainerClassName="px-gutter pb-section-gap pt-2">
            <View className={inner}>{body}</View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}
