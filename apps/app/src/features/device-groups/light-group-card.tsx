import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import type { DeviceTarget } from '@smarteverything/domain';
import { useWidgetFrame } from '../../components/widget-board/widget-scope';
import { useIdiom } from '../../design/platform';
import { useMeasuredWidth } from '../../components/use-measured-width';
import { LightGroup } from './widget/light-group';

const MIN_MEMBER_WIDTH = 220;
const MAX_COLUMNS = 3;
const CAPPED_HEIGHT = { touch: 520, pointer: 460 } as const;

function columnsFor(width: number): number {
  return Math.min(MAX_COLUMNS, Math.max(1, Math.floor(width / MIN_MEMBER_WIDTH)));
}

export function LightGroupCard({
  target,
  rows,
  title,
  href,
  availableWidth,
}: {
  readonly target: DeviceTarget;
  readonly rows: 'fit' | 'capped' | 'all';
  readonly title?: string;
  readonly href?: Href;
  readonly availableWidth?: number;
}): ReactNode {
  const idiom = useIdiom();
  const { width, onLayout } = useMeasuredWidth(Math.round, availableWidth);
  const scoped = useWidgetFrame();
  const fit = rows === 'fit' && scoped !== null;
  const capped = rows === 'capped';
  const frame = fit ? scoped : { width, height: capped ? CAPPED_HEIGHT[idiom] : 0, idiom };
  const card = (
    <LightGroup
      target={target}
      frame={frame}
      {...(fit || capped ? {} : { allColumns: columnsFor(width) })}
      {...(title === undefined ? {} : { title })}
      {...(href === undefined ? {} : { titleHref: href })}
    />
  );
  return fit ? card : <View onLayout={onLayout}>{card}</View>;
}
