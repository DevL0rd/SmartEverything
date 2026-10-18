import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { MiniStage, StageDot } from '../model/mini-stage';

function dotClass(dot: StageDot): string {
  if (dot.power === 'offline') return 'border-hairline border-dashed border-on-surface-variant';
  if (dot.power === 'off') return 'border-hairline border-on-surface-variant';
  return dot.colour === null ? 'bg-primary' : '';
}

function Dot({ dot }: { readonly dot: StageDot }): ReactNode {
  const lit = dot.power === 'on' && dot.colour !== null;
  return (
    <View
      className={cn('size-3.5 rounded-full', dotClass(dot))}
      style={lit ? { backgroundColor: dot.colour, opacity: dot.opacity } : undefined}
    />
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
