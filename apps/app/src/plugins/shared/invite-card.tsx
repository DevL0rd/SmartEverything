import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../components/card';
import { IconWell } from '../../components/icon-well';
import type { IconName } from '../../components/icon';
import { Text } from '../../components/text';
import { PluginButton, type PluginPress } from './plugin-action';

export interface InviteCardProps {
  readonly icon: IconName;
  readonly title: string;
  readonly detail: string;
  readonly accept: PluginPress;
  readonly ignore: PluginPress;
}

export function InviteCard({ icon, title, detail, accept, ignore }: InviteCardProps): ReactNode {
  return (
    <Card label={title}>
      <View className="flex-row items-start gap-3">
        <IconWell icon={icon} colour="info" size="m" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="body-strong">{title}</Text>
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {detail}
          </Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <PluginButton label="Accept" variant="filled" {...accept} />
        <PluginButton label="Ignore" variant="tonal" {...ignore} />
      </View>
    </Card>
  );
}
