import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { count } from '../../../format/number';
import { SelectionGroup, SelectionSurface } from '../components/selection-surface';

export interface PickAction {
  readonly id: string;
  readonly label: string;
  readonly short: string;
  readonly icon: IconName;
  readonly look: 'primary' | 'plain' | 'destructive';
  readonly onPress: () => void;
}

export interface PickBarProps {
  readonly picked: number;
  readonly total: number;
  readonly disabled: boolean;
  readonly actions: readonly PickAction[];
  readonly onClear: () => void;
  readonly onAll: () => void;
}

export function pickedLine(picked: number): string {
  return picked === 0 ? 'Select items' : `${count(picked)} selected`;
}

function Summary({ bar }: { readonly bar: PickBarProps }): ReactNode {
  useEscape(true, bar.onClear);
  return (
    <>
      <IconButton
        icon="close"
        label="Clear the selection"
        tone="onPrimaryContainer"
        onPress={bar.onClear}
      />
      <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
        <Text
          variant="title-3"
          tone="onPrimaryContainer"
          className="tabular-nums"
          numberOfLines={1}
        >
          {pickedLine(bar.picked)}
        </Text>
        {bar.picked < bar.total ? (
          <Button label="Select all" variant="text" onPress={bar.onAll} />
        ) : null}
      </View>
    </>
  );
}

const VARIANT = { primary: 'filled', plain: 'outlined', destructive: 'destructive' } as const;

export function PickBar(props: PickBarProps): ReactNode {
  const off = props.disabled || props.picked === 0;
  return (
    <SelectionSurface>
      <Summary bar={props} />
      {off ? null : (
        <SelectionGroup>
          {props.actions.map((action) => (
            <Button
              key={action.id}
              label={action.label}
              icon={action.icon}
              variant={VARIANT[action.look]}
              onPress={action.onPress}
            />
          ))}
        </SelectionGroup>
      )}
    </SelectionSurface>
  );
}

export function PickHead(props: PickBarProps): ReactNode {
  return (
    <SelectionSurface>
      <Summary bar={props} />
    </SelectionSurface>
  );
}

export function PickRow(props: PickBarProps): ReactNode {
  const off = props.disabled || props.picked === 0;
  return (
    <View className="flex-row">
      {props.actions.map((action) => {
        const tone = action.look === 'destructive' ? 'critical' : 'default';
        return (
          <Interactive
            key={action.id}
            label={action.label}
            disabled={off}
            onPress={action.onPress}
            className="min-h-touch-min flex-1 items-center justify-center gap-1 rounded-md py-1"
            layerClassName="rounded-md"
          >
            <Icon name={action.icon} size={24} tone={tone} />
            <Text variant="caption" tone={tone} numberOfLines={1}>
              {action.short}
            </Text>
          </Interactive>
        );
      })}
    </View>
  );
}
