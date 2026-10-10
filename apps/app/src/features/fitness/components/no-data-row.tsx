import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { shortDate, startOfDayKey } from '../../../format/time';

export function NoDataRow({
  what,
  lastDay,
}: {
  readonly what: string;
  readonly lastDay: string | null;
}): ReactNode {
  const message =
    lastDay === null ? `No ${what} yet` : `No ${what} since ${shortDate(startOfDayKey(lastDay))}`;
  return (
    <View className="min-h-row-h flex-row items-center gap-2 px-1">
      <Text variant="callout" tone="variant" className="shrink">
        {message}
      </Text>
      <Interactive
        href={href.settings.page('health/sources')}
        label="Data sources"
        className="min-h-touch-min justify-center rounded-sm px-2"
        layerClassName="rounded-sm"
      >
        <Text variant="label" tone="primary">
          Sources
        </Text>
      </Interactive>
    </View>
  );
}
