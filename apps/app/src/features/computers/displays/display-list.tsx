import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DisplayOutput } from '@smarteverything/domain';
import { IconWell } from '../../../components/icon-well';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { modeLine } from '../model/displays-model';

export function DisplayRow({
  output,
  disabled,
  canSwitch,
  onOpen,
  onToggle,
}: {
  readonly output: DisplayOutput;
  readonly disabled: boolean;
  readonly canSwitch: boolean;
  readonly onOpen: () => void;
  readonly onToggle: (enabled: boolean) => void;
}): ReactNode {
  return (
    <View className="min-h-row-h-2 flex-row items-center gap-2 pl-4 pr-3">
      <Interactive
        label={`${output.name}, ${output.id}, open settings`}
        onPress={onOpen}
        className="min-h-row-h-2 min-w-0 flex-1 flex-row items-center gap-3"
        layerClassName="rounded-md"
      >
        <IconWell icon="tv" colour={output.enabled ? 'viz-1' : 'on-surface-faint'} size="m" />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text variant="body" numberOfLines={1} className="shrink">
              {output.name}
            </Text>
            {output.primary ? (
              <View className="rounded-full bg-surface-2 px-2 py-0.5">
                <Text variant="caption">Primary</Text>
              </View>
            ) : null}
          </View>
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {modeLine(output)}
          </Text>
        </View>
        <Icon name="chevronRight" size={16} />
      </Interactive>
      {canSwitch ? (
        <Switch
          value={output.enabled}
          label={`${output.name} enabled`}
          disabled={disabled}
          onChange={onToggle}
        />
      ) : null}
    </View>
  );
}
