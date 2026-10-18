import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import type { Crumb } from './path-model';

function CrumbButton({
  crumb,
  last,
  onGo,
}: {
  readonly crumb: Crumb;
  readonly last: boolean;
  readonly onGo: (path: string) => void;
}): ReactNode {
  return (
    <Interactive
      label={`Go to ${crumb.label}`}
      onPress={() => {
        onGo(crumb.path);
      }}
      className="min-h-touch-min justify-center rounded-sm px-1.5"
    >
      <Text
        variant="callout"
        tone={last ? 'default' : 'variant'}
        className={last ? 'font-sans-semibold' : ''}
        numberOfLines={1}
      >
        {crumb.label}
      </Text>
    </Interactive>
  );
}

export function CrumbTrail({
  crumbs,
  onGo,
}: {
  readonly crumbs: readonly Crumb[];
  readonly onGo: (path: string) => void;
}): ReactNode {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex-row items-center gap-0.5 px-2">
        {crumbs.map((crumb, index) => (
          <View key={crumb.path} className="flex-row items-center">
            {index === 0 ? null : <Icon name="chevronRight" size={16} tone="faint" />}
            <CrumbButton crumb={crumb} last={index === crumbs.length - 1} onGo={onGo} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function FolderBar({
  crumbs,
  machine,
  online,
  showHidden,
  onHidden,
  onGo,
}: {
  readonly crumbs: readonly Crumb[];
  readonly machine: string;
  readonly online: boolean;
  readonly showHidden: boolean;
  readonly onHidden: (value: boolean) => void;
  readonly onGo: (path: string) => void;
}): ReactNode {
  return (
    <View className="gap-1 pb-2">
      <CrumbTrail crumbs={crumbs} onGo={onGo} />
      <View className="flex-row items-center justify-between gap-3 px-4">
        <Text variant="footnote" tone={online ? 'positive' : 'faint'} numberOfLines={1}>
          {`${machine} · ${online ? 'online' : 'offline'}`}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text variant="footnote" tone="variant">
            Show hidden
          </Text>
          <Switch value={showHidden} onChange={onHidden} label="Show hidden files" />
        </View>
      </View>
    </View>
  );
}
