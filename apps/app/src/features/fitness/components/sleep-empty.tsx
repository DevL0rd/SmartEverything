import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Hypnogram } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useLastDayOf } from '../data/latest-days';
import { seriesOf } from '../model/catalogue';
import { emptyCopyOf } from '../model/night-card';

export function SleepEmpty({ day }: { readonly day: string }): ReactNode {
  const copy = emptyCopyOf(useLastDayOf(seriesOf('sleep'), day));
  return (
    <Card title="Last night" icon="moon">
      <Hypnogram segments={[]} label="Sleep stages" />
      <View className="gap-1">
        <Text variant="title-3">{copy.title}</Text>
        <Text variant="callout" tone="variant">
          {copy.body}
        </Text>
      </View>
      <View className="flex-row">
        <Button
          label="Check sources"
          variant="text"
          href={href.settings.page('health/sources')}
          hint="Opens the health data sources."
        />
      </View>
    </Card>
  );
}
