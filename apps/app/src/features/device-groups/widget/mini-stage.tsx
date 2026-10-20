import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { MiniStage, StageDot } from '../model/mini-stage';

function Dot({ dot }: { readonly dot: StageDot }): ReactNode {
  const lit = dot.power === 'on';
  const fill =
    dot.colour === null
      ? { opacity: dot.opacity }
      : { opacity: dot.opacity, backgroundColor: dot.colour };
  return (
    <View
      className={cn(
        'size-3.5 overflow-hidden rounded-full border',
        dot.power === 'unknown' ? 'border-outline-variant' : 'border-on-surface-variant',
        dot.power === 'offline' && 'border-dashed',
      )}
    >
      {lit ? (
        <View
          className={cn('absolute inset-0', dot.colour === null && 'bg-primary')}
          style={fill}
        />
      ) : null}
    </View>
  );
}

export function MiniStageDots({ stage }: { readonly stage: MiniStage }): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5" aria-hidden>
      {stage.dots.map((dot) => (
        <Dot key={dot.id} dot={dot} />
      ))}
      {stage.hidden > 0 ? (
        <Text
          variant="caption"
          tone="variant"
          className="tabular"
        >{`+${String(stage.hidden)}`}</Text>
      ) : null}
    </View>
  );
}
