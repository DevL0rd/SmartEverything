import type { ReactNode } from 'react';
import { View } from 'react-native';
import { levelFrameClass } from '../../../components/level-frame';
import { useIdiom } from '../../../design/platform';

export function RowFrame({
  expanded,
  children,
}: {
  readonly expanded: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const idiom = useIdiom();
  return (
    <View
      className={levelFrameClass(
        {
          shape: expanded ? 'rowOpen' : 'row',
          white: false,
          disabled: false,
          className: 'flex-row items-center',
        },
        idiom,
      )}
    >
      {children}
    </View>
  );
}
