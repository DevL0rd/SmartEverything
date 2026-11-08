import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { useGridLayout } from '../../../components/grid';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';

const COLUMN = 'min-w-0 max-w-reading gap-section-gap';
const MIN_COLUMN_WIDTH = 352;

function appearanceBlocksOf(children: ReactNode): {
  readonly reset: ReactNode;
  readonly leading: readonly ReactNode[];
  readonly trailing: readonly ReactNode[];
} {
  let reset: ReactNode = null;
  const leading: ReactNode[] = [];
  const trailing: ReactNode[] = [];
  let group = leading;
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.key === 'appearance.invalid') {
      reset = child;
      return;
    }
    if (child.key === 'appearance.surface') group = trailing;
    group.push(child);
  });
  return { reset, leading, trailing };
}

export function AppearanceBlocks({ children }: { readonly children: ReactNode }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const { columns } = useGridLayout(width, MIN_COLUMN_WIDTH, 'grid', 3);
  const { reset, leading, trailing } = appearanceBlocksOf(children);
  const split = columns > 1;
  const spread = columns === 3;
  return (
    <View className="gap-section-gap" onLayout={onLayout}>
      {reset === null ? null : <View className="max-w-reading">{reset}</View>}
      <View
        className={cn(split && 'flex-row items-start gap-grid-gap', !split && 'gap-section-gap')}
      >
        <View
          className={cn(
            'min-w-0',
            spread ? 'flex-2 flex-row items-start gap-grid-gap' : 'gap-section-gap',
            columns === 2 && 'flex-1',
          )}
        >
          {Children.map(leading, (child) => (
            <View className={cn(COLUMN, spread && 'flex-1')}>{child}</View>
          ))}
        </View>
        <View className={cn(COLUMN, split && 'flex-1')}>{trailing}</View>
      </View>
    </View>
  );
}
