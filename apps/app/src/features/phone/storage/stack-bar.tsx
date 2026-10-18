import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { cn } from '../../../design/cn';
import { Text } from '../../../components/text';
import type { StackColour } from './storage-model';

const FILL: Readonly<Record<StackColour, string>> = {
  'viz-1': 'bg-viz-1',
  'viz-2': 'bg-viz-2',
  'viz-3': 'bg-viz-3',
  'viz-4': 'bg-viz-4',
  'viz-5': 'bg-viz-5',
  'viz-6': 'bg-viz-6',
};

export interface StackPart {
  readonly key: string;
  readonly label: string;
  readonly weight: number;
  readonly colour: StackColour | null;
  readonly text: string;
}

function Piece({ part }: { readonly part: StackPart }): ReactNode {
  const size: ViewStyle = { flexGrow: part.weight, flexBasis: 0 };
  return (
    <View
      style={size}
      className={cn('h-full', part.colour === null ? 'bg-surface-3' : FILL[part.colour])}
    />
  );
}

function Swatch({ colour }: { readonly colour: StackColour | null }): ReactNode {
  return (
    <View
      className={cn(
        'size-2.5 rounded-xs',
        colour === null ? 'border border-outline bg-surface-3' : FILL[colour],
      )}
    />
  );
}

export function StackBar({
  parts,
  label,
  thick = false,
}: {
  readonly parts: readonly StackPart[];
  readonly label: string;
  readonly thick?: boolean;
}): ReactNode {
  return (
    <View className="gap-2">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        className={cn(
          'flex-row gap-0.5 overflow-hidden rounded-full bg-surface-3',
          thick ? 'h-4' : 'h-3',
        )}
      >
        {parts
          .filter((part) => part.weight > 0)
          .map((part) => (
            <Piece key={part.key} part={part} />
          ))}
      </View>
      <View aria-hidden className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        {parts.map((part) => (
          <View key={part.key} className="flex-row items-center gap-1.5">
            <Swatch colour={part.colour} />
            <Text variant="footnote" tone="variant">
              {part.label}
            </Text>
            <Text variant="footnote" className="tabular">
              {part.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
