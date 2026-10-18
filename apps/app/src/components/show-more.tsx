import { useState, type ReactNode } from 'react';
import { Interactive } from './interactive';
import { Text } from './text';

export const PAGE_SIZE = 40;

export function ShowMore({
  remaining,
  onPress,
}: {
  readonly remaining: number;
  readonly onPress: () => void;
}): ReactNode {
  if (remaining <= 0) {
    return null;
  }
  const label = `Show ${String(Math.min(remaining, PAGE_SIZE))} more`;
  return (
    <Interactive
      label={label}
      onPress={onPress}
      className="min-h-touch-min items-center justify-center px-4"
    >
      <Text variant="callout" tone="primary">
        {label}
      </Text>
    </Interactive>
  );
}

export function useRevealed<T>(items: readonly T[]): {
  readonly shown: readonly T[];
  readonly more: ReactNode;
} {
  const [limit, setLimit] = useState(PAGE_SIZE);
  return {
    shown: items.slice(0, limit),
    more: (
      <ShowMore
        remaining={items.length - limit}
        onPress={() => {
          setLimit(limit + PAGE_SIZE);
        }}
      />
    ),
  };
}
