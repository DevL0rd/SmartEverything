import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';

export interface KeyEntry {
  readonly label: string;
  readonly colour: ColourRole;
  readonly mark: 'solid' | 'tint' | 'outline' | 'dashed' | 'check';
  readonly opacity?: number;
}

const KEY_SIZE = 12;

function Mark({ entry }: { readonly entry: KeyEntry }): ReactNode {
  const colour = useColour(entry.colour);
  if (entry.mark === 'check') {
    return <Icon name="check" size={KEY_SIZE + 2} tone="positive" />;
  }
  const box = {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderColor: colour,
    backgroundColor: entry.mark === 'solid' ? colour : 'transparent',
    borderStyle: entry.mark === 'dashed' ? ('dashed' as const) : ('solid' as const),
  };
  const wash = { backgroundColor: colour, opacity: entry.opacity ?? 0.3 };
  return (
    <View style={box} className="overflow-hidden rounded-xs border">
      {entry.mark === 'tint' ? <View style={wash} className="size-full" /> : null}
    </View>
  );
}

export function ChartKey({ entries }: { readonly entries: readonly KeyEntry[] }): ReactNode {
  return (
    <View aria-hidden className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      {entries.map((entry) => (
        <View key={entry.label} className="flex-row items-center gap-1.5">
          <Mark entry={entry} />
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {entry.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ScaleKey({
  colour,
  opacities,
}: {
  readonly colour: ColourRole;
  readonly opacities: readonly number[];
}): ReactNode {
  return (
    <View aria-hidden className="flex-row items-center gap-1.5">
      <Text variant="footnote" tone="variant">
        Less
      </Text>
      <Mark entry={{ label: 'None', colour: 'outline', mark: 'outline' }} />
      {opacities.map((opacity) => (
        <Mark key={opacity} entry={{ label: 'Level', colour, mark: 'tint', opacity }} />
      ))}
      <Text variant="footnote" tone="variant">
        More
      </Text>
    </View>
  );
}
