import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { Text } from './text';

const DELAY_MS = 500;

const PLACEMENT = {
  below: 'top-full mt-1 self-center',
  above: 'bottom-full mb-1 self-center',
  right: 'left-full ml-2 top-0',
} as const;

export interface TooltipProps {
  readonly text: string;
  readonly placement?: keyof typeof PLACEMENT;
}

export function Tooltip({ text, placement = 'below' }: TooltipProps): ReactNode {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShown(true);
    }, DELAY_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, []);
  if (!shown) {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      className={cn(
        'absolute z-50 rounded-sm bg-on-surface px-2 py-1 elevation-2',
        PLACEMENT[placement],
      )}
    >
      <Text variant="caption" className="text-bg" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
