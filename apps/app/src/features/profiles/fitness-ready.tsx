import type { ReactNode } from 'react';
import { View } from 'react-native';
import { fitnessReady } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { WidgetEmpty, WidgetFrame } from '../../components/widget-board';
import { Text } from '../../components/text';
import { useActiveProfile } from '../../store/people';

export function useFitnessReady(): boolean {
  const profile = useActiveProfile();
  return profile !== null && fitnessReady(profile);
}

export function FinishFitnessCard({ compact = false }: { readonly compact?: boolean }): ReactNode {
  return (
    <Card title="Finish setting up Fitness" icon="fitness" tone="attention">
      <View className="gap-3">
        {compact ? null : (
          <Text variant="callout" tone="variant">
            Your height, birthday and sex make body composition, calories and heart-rate zones
            right.
          </Text>
        )}
        <Button label="Set up Fitness" variant="tonal" href={href.fitnessSetup()} />
      </View>
    </Card>
  );
}

export function FitnessSetupWidget({ title }: { readonly title: string }): ReactNode {
  return (
    <WidgetFrame title={title} icon="fitness" accent="move" href={href.fitnessSetup()}>
      <WidgetEmpty
        icon="user"
        colour="move"
        title="Finish setting up Fitness"
        body="Add your height, birthday and sex."
        action={{ label: 'Set up', href: href.fitnessSetup() }}
      />
    </WidgetFrame>
  );
}
