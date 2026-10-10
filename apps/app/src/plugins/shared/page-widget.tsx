import { WIDGET_FOOTPRINTS } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { WidgetSize } from '../../components/widget-board';
import { useIdiom } from '../../design/platform';
import { SEMANTIC_SIZES } from '../../design/tokens';
import { useAppliedTheme } from '../../design/theme';

function heightStyle(height: number): { readonly height: number } {
  return { height };
}

export function PageWidget({
  size,
  children,
}: {
  readonly size: WidgetSize;
  readonly children: ReactNode;
}): ReactNode {
  const idiom = useIdiom();
  const { density } = useAppliedTheme().settings;
  const { rowUnit, gridGap } = SEMANTIC_SIZES[idiom][density];
  const { rows } = WIDGET_FOOTPRINTS.compact[size];
  return <View style={heightStyle(rows * rowUnit + (rows - 1) * gridGap)}>{children}</View>;
}
