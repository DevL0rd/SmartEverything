import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AppHref } from '../../components/app-href';
import type { DeviceTarget } from '@smarteverything/domain';
import { frameClassOf, tierInnerHeight } from '../../components/widget-board';
import { useWidgetFrame } from '../../components/widget-board/widget-scope';
import { useIdiom } from '../../design/platform';
import { useThemeSetting } from '../../design/theme';
import { useMeasuredWidth } from '../../components/use-measured-width';
import { rowColumns } from './group-layout';
import { LightGroup } from './widget/light-group';

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
  readonly href?: AppHref;
  readonly availableWidth?: number;
}): ReactNode {
  const idiom = useIdiom();
  const tall = tierInnerHeight('XL', idiom, useThemeSetting('density'));
  const { width, onLayout } = useMeasuredWidth(Math.round, availableWidth);
  const scoped = useWidgetFrame();
  const fit = rows === 'fit' && scoped !== null;
  const capped = rows === 'capped';
  const frame = fit ? scoped : { width, height: tall, idiom };
  const columns = frameClassOf(frame) === 'xl' ? rowColumns(width) : 1;
  const card = (
    <LightGroup
      target={target}
      frame={frame}
      {...(fit || capped ? {} : { allColumns: columns })}
      {...(title === undefined ? {} : { title })}
      {...(href === undefined ? {} : { titleHref: href })}
    />
  );
  return fit ? card : <View onLayout={onLayout}>{card}</View>;
}
