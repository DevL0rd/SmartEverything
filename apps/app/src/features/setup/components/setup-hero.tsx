import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { readinessLine, type Readiness } from '../model/readiness';

function Gauge({ readiness }: { readonly readiness: Readiness }): ReactNode {
  return (
    <View
      role="img"
      accessibilityLabel={`${String(readiness.done)} of ${String(readiness.total)} ready`}
      className="flex-row gap-1.5"
    >
      {readiness.counted.map((entry) => (
        <View
          key={entry.item.id}
          className={cn(
            'h-2.5 flex-1 rounded-full',
            entry.state === 'done' ? 'bg-positive' : 'bg-surface-3',
          )}
        />
      ))}
    </View>
  );
}

export function SetupHero({ readiness }: { readonly readiness: Readiness }): ReactNode {
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <View
          className={cn(
            'size-12 items-center justify-center rounded-full',
            readiness.ready ? 'bg-positive/15' : 'bg-primary-container',
          )}
        >
          <Icon
            name={readiness.ready ? 'circleCheck' : 'settings'}
            size={24}
            tone={readiness.ready ? 'positive' : 'primary'}
          />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-baseline gap-1.5">
            <Text variant="title-1" className="tabular">
              {String(readiness.done)}
            </Text>
            <Text variant="callout" tone="variant">
              {`of ${String(readiness.total)} ready`}
            </Text>
          </View>
          <Text variant="footnote" tone="variant">
            {readinessLine(readiness)}
          </Text>
        </View>
      </View>
      <Gauge readiness={readiness} />
    </Card>
  );
}
