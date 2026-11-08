import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { ProgressBar } from '../../../../components/charts';
import { Text } from '../../../../components/text';
import { BatteryRing } from '../components/battery-ring';
import { SHOW_ACTIONS, type RevealTarget } from '../page-model';
import type { RowAction, StatusStrip } from './overview-model';

export function Strip({
  strip,
  badge,
}: {
  readonly strip: StatusStrip;
  readonly badge: ReactNode;
}): ReactNode {
  return (
    <View className="gap-3 rounded-lg bg-surface-1 p-4">
      <View className="flex-row items-center gap-3">
        {strip.battery === null ? null : <BatteryRing percent={strip.battery} />}
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={2} accessibilityLiveRegion="polite">
            {strip.title}
          </Text>
          {strip.detail === null ? null : (
            <Text variant="footnote" tone="variant" numberOfLines={1}>
              {strip.detail}
            </Text>
          )}
        </View>
        {badge}
      </View>
      {strip.progress === null ? null : (
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <ProgressBar progress={strip.progress} colour="primary" label="Progress" />
          </View>
          <Text variant="caption" tone="variant" className="tabular">
            {`${String(Math.round(strip.progress * 100))}%`}
          </Text>
        </View>
      )}
    </View>
  );
}

export function ShowRow({
  onShow,
}: {
  readonly onShow: (target: RevealTarget) => void;
}): ReactNode {
  return (
    <View className="flex-row gap-2">
      {SHOW_ACTIONS.map((action) => (
        <Button
          key={action.target}
          label={action.label}
          icon={action.icon}
          size="lg"
          grow
          variant="outlined"
          onPress={() => {
            onShow(action.target);
          }}
        />
      ))}
    </View>
  );
}

const VARIANTS = {
  primary: 'filled',
  secondary: 'tonal',
  danger: 'destructive',
} as const;

export function CommandRow({
  actions,
  onPress,
}: {
  readonly actions: readonly RowAction[];
  readonly onPress: (action: RowAction) => void;
}): ReactNode {
  if (actions.length === 0) {
    return null;
  }
  const lone = actions.length === 1;
  return (
    <View className="flex-row gap-2">
      {actions.map((action) => (
        <Button
          key={action.key}
          label={action.label}
          icon={action.icon}
          size="lg"
          grow={lone || action.look === 'primary'}
          variant={VARIANTS[action.look]}
          onPress={() => {
            onPress(action);
          }}
        />
      ))}
    </View>
  );
}
