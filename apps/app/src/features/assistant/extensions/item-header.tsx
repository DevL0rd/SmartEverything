import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { IconWell } from '../../../components/icon-well';
import type { IconName } from '../../../components/icon';
import { Text } from '../../../components/text';

export interface ItemHeaderProps {
  readonly icon: IconName;
  readonly kind: 'extension' | 'skill';
  readonly included: boolean;
  readonly description: string;
  readonly byline: string;
}

function SourceBadge({ kind, included }: Pick<ItemHeaderProps, 'kind' | 'included'>): ReactNode {
  if (included) return <Badge label="Included" icon="box" />;
  return kind === 'skill' ? (
    <Badge label="Skill" icon="fileText" />
  ) : (
    <Badge label="Extension" icon="puzzle" />
  );
}

export function ItemHeader({
  icon,
  kind,
  included,
  description,
  byline,
}: ItemHeaderProps): ReactNode {
  return (
    <View className="flex-row items-start gap-4 px-1">
      <IconWell icon={icon} colour="primary" size="l" />
      <View className="min-w-0 flex-1 gap-2">
        <Text variant="body" selectable>
          {description}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <SourceBadge kind={kind} included={included} />
          <Text variant="footnote" tone="variant">
            {byline}
          </Text>
        </View>
      </View>
    </View>
  );
}
