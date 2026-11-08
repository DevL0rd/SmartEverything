import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { ThemeScope } from '../../../design/theme-scope';

type Corner = 'top-left' | 'top-right';

const CORNER: Readonly<Record<Corner, string>> = {
  'top-left': 'top-1.5 left-1.5',
  'top-right': 'top-1.5 right-1.5',
};

export function PhotoMark({
  label,
  corner = 'top-left',
}: {
  readonly label: string;
  readonly corner?: Corner;
}): ReactNode {
  return (
    <ThemeScope theme="dark">
      <View
        pointerEvents="none"
        className={cn('absolute max-w-3/4 rounded-full bg-black/50 px-2 py-0.5', CORNER[corner])}
      >
        <Text variant="caption" numberOfLines={1} className="tabular-nums">
          {label}
        </Text>
      </View>
    </ThemeScope>
  );
}
